# frozen_string_literal: true

# Turns the search query syntax into ActiveRecord scopes for instances not
# running Elasticsearch, so DatabaseStatusSearch honours the operators whose
# filters map straight onto `statuses` columns.
#
# SearchQueryParser is backend-agnostic -- it only builds a Parslet tree -- so
# this reuses it and stands in for SearchQueryTransformer, which turns the same
# tree into Elasticsearch clauses.
#
# Text matching is deliberately NOT brought in line with Elasticsearch: the
# terms left after the operators are stripped are joined back into one literal
# substring for Status.matching_text, rather than an AND over stemmed tokens.
#
# Operators this cannot serve (has:media, has:embed, in:...) are dropped rather
# than matched as body text. Dropping widens the result set, while letting
# "from:@someone" through to the substring match silently returns nothing --
# which reads to the searcher as "no such post".
class DatabaseSearchQuery
  EPOCH_RE = /\A\d+\z/

  SUPPORTED_PREFIXES = %w(from language before after during is has).freeze

  # The operator forms the web UI's search popout may offer, in the shape
  # InitialStateSerializer ships them ("<prefix>" or "<prefix>:<value>").
  SUPPORTED_OPERATORS = %w(
    has:poll
    is:reply
    is:sensitive
    language
    from
    before
    during
    after
  ).freeze

  PROPERTY_FILTERS = {
    'reply' => ->(scope, negated) { negated ? scope.where(in_reply_to_id: nil) : scope.where.not(in_reply_to_id: nil) },
    'sensitive' => ->(scope, negated) { scope.where(sensitive: !negated) },
    'poll' => ->(scope, negated) { negated ? scope.where(poll_id: nil) : scope.where.not(poll_id: nil) },
  }.freeze

  # @param [String] query the query exactly as typed
  # @param [Account] current_account the viewer, for `from:me` and the time zone
  def initialize(query, current_account)
    @query = query.to_s
    @current_account = current_account
    @text_parts = []
    @filters = []
    @impossible = false

    parse!
  end

  # The literal substring left once the operators are stripped, or nil when the
  # query was nothing but operators.
  # @return [String, nil]
  def text
    @text.presence
  end

  # Whether an operator can never match -- an account that does not exist, or a
  # date that will not parse -- so the caller can skip the query outright.
  def impossible?
    @impossible
  end

  # @param [ActiveRecord::Relation] scope
  # @return [ActiveRecord::Relation]
  def apply(scope)
    @filters.reduce(scope) { |relation, filter| filter.call(relation) }
  end

  private

  attr_reader :current_account

  def parse!
    clauses.each { |clause| consume(clause) }
    @text = @text_parts.join(' ')
  end

  def clauses
    tree  = SearchQueryParser.new.parse(@query)
    nodes = tree[:query] if tree.is_a?(Hash)
    return [] unless nodes.is_a?(Array)

    nodes.filter_map { |node| node[:clause] if node.is_a?(Hash) && node[:clause].is_a?(Hash) }
  rescue Parslet::ParseFailed
    # Unparseable input is matched as typed, the way the whole query was before
    # any operator was understood here.
    @text_parts << @query
    []
  end

  def consume(clause)
    negated = clause[:operator].to_s == '-'
    prefix  = clause[:prefix][:term].to_s.downcase if clause[:prefix].is_a?(Hash)
    term    = term_from(clause)

    if prefix.nil?
      # A negated term is dropped rather than folded into the substring, which
      # would search for the very text the user asked to exclude.
      @text_parts << term if !negated && term.present?
    elsif SUPPORTED_PREFIXES.include?(prefix)
      add_filter(prefix, term, negated)
    elsif SearchQueryTransformer::SUPPORTED_PREFIXES.exclude?(prefix)
      # Not search syntax at all, so it is the user's literal text.
      @text_parts << "#{prefix}:#{term}"
    end
  end

  def term_from(clause)
    if clause[:phrase].is_a?(Array)
      clause[:phrase].map { |part| part[:term].to_s }.join(' ')
    elsif clause[:shortcode].is_a?(Hash)
      ":#{clause[:shortcode][:term]}:"
    else
      clause[:term].to_s
    end
  end

  def add_filter(prefix, term, negated)
    case prefix
    when 'from'
      account_filter(term, negated)
    when 'language'
      language_filter(term, negated)
    when 'is', 'has'
      property_filter(term, negated)
    when 'before', 'after', 'during'
      date_filter(prefix, term, negated)
    end
  end

  def account_filter(term, negated)
    account_id = account_id_from(term)

    if account_id.nil?
      # Excluding an account that does not exist rules nothing out; requiring
      # one rules everything out.
      @impossible = true unless negated
      return
    end

    @filters << ->(scope) { negated ? scope.where.not(account_id: account_id) : scope.where(account_id: account_id) }
  end

  def language_filter(term, negated)
    code = language_code_from(term)

    @filters << ->(scope) { negated ? scope.where.not(language: code) : scope.where(language: code) }
  end

  def property_filter(term, negated)
    filter = PROPERTY_FILTERS[term.downcase]

    # has:media and has:embed need joins this backend does not do; leaving them
    # out widens the results instead of emptying them.
    return if filter.nil?

    @filters << ->(scope) { filter.call(scope, negated) }
  end

  def date_filter(prefix, term, negated)
    range = range_from(term)

    if range.nil?
      @impossible = true unless negated
      return
    end

    created_at = Status.arel_table[:created_at]

    node = case prefix
           when 'before' then created_at.lt(range.first)
           when 'after'  then created_at.gt(range.last)
           else               created_at.between(range)
           end
    node = node.not if negated

    @filters << ->(scope) { scope.where(node) }
  end

  def account_id_from(term)
    return current_account&.id if term == 'me'

    username, domain = term.delete_prefix('@').split('@')
    domain = nil if TagManager.instance.local_domain?(domain)

    Account.find_remote(username, domain)&.id
  end

  def language_code_from(term)
    [term, term.downcase, term.split(/[_-]/).first.to_s.downcase].each do |code|
      return code if LanguagesHelper::SUPPORTED_LOCALES.key?(code.to_sym)
    end

    term
  end

  # A day in the viewer's time zone, matching how Elasticsearch rounds a bare
  # date, or the exact instant for the epoch-millisecond form it also accepts.
  def range_from(term)
    if EPOCH_RE.match?(term)
      instant = Time.zone.at(term.to_i / 1000.0)
      return instant..instant
    end

    Date.iso8601(term).in_time_zone(time_zone).all_day
  rescue Date::Error, ArgumentError, TypeError
    nil
  end

  def time_zone
    ActiveSupport::TimeZone[current_account&.user_time_zone.presence || 'UTC'] || Time.zone
  end
end
