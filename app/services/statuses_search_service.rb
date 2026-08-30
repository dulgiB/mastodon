# frozen_string_literal: true

class StatusesSearchService < BaseService
  include SearchStoplight

  def call(query, account = nil, options = {})
    MastodonOTELTracer.in_span('StatusesSearchService#call') do |span|
      @query   = query&.strip
      @account = account
      @options = options
      @limit   = options[:limit].to_i
      @offset  = options[:offset].to_i

      span.add_attributes(
        'search.offset' => @offset,
        'search.limit' => @limit,
        'search.backend' => Chewy.enabled? ? 'elasticsearch' : 'database'
      )

      status_search_results.tap do |results|
        span.set_attribute('search.results.count', results.size)
      end
    end
  end

  private

  def status_search_results
    return database_search_results unless Chewy.enabled?

    convert_deprecated_options!

    request             = parsed_query.request
    results             = elastic_stoplight_wrapper.run { request.collapse(field: :id).order(id: { order: :desc }).limit(@limit).offset(@offset).objects.compact }
    account_ids         = results.map(&:account_id)
    account_domains     = results.map(&:account_domain)

    @account.preload_relations!(account_ids, account_domains)

    results.reject { |status| StatusFilter.new(status, @account).filtered? }
  rescue Stoplight::Error::RedLight, Faraday::ConnectionFailed, Parslet::ParseFailed, Errno::ENETUNREACH, OpenSSL::SSL::SSLError, Elastic::Transport::Transport::Error
    []
  end

  # Elasticsearch is understood to be unavailable rather than merely
  # disabled by choice here (Chewy.enabled? covers both), so this stands
  # in with a plain substring search over the database. It only supports
  # a literal query and the from:/min_id/max_id options above — none of
  # SearchQueryTransformer's other operators (is:, has:, before:, quoted
  # phrases, ...) apply.
  def database_search_results
    return [] if @query.blank?

    results = DatabaseStatusSearch.new(@account).call(
      @query,
      limit: @limit,
      offset: @offset,
      account_id: @options[:account_id],
      min_id: @options[:min_id],
      max_id: @options[:max_id]
    )

    @account.preload_relations!(results.map(&:account_id), results.map(&:account_domain))

    results.reject { |status| StatusFilter.new(status, @account).filtered? }
  end

  def parsed_query
    SearchQueryTransformer.new.apply(SearchQueryParser.new.parse(@query), current_account: @account)
  end

  def convert_deprecated_options!
    syntax_options = []

    if @options[:account_id]
      username = Account.select(:username, :domain).find(@options[:account_id]).acct
      syntax_options << "from:@#{username}"
    end

    if @options[:min_id]
      timestamp = Mastodon::Snowflake.to_time(@options[:min_id].to_i)
      syntax_options << "after:\"#{timestamp.iso8601}\""
    end

    if @options[:max_id]
      timestamp = Mastodon::Snowflake.to_time(@options[:max_id].to_i)
      syntax_options << "before:\"#{timestamp.iso8601}\""
    end

    @query = "#{@query} #{syntax_options.join(' ')}".strip if syntax_options.any?
  end
end
