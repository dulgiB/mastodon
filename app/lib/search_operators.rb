# frozen_string_literal: true

# Which search operators the active backend can actually serve. Shipped to the
# web UI by InitialStateSerializer so the search popout offers only what will
# work: with Elasticsearch that is the whole SearchQueryTransformer syntax,
# without it the subset DatabaseSearchQuery maps onto `statuses` columns.
#
# Entries are either a bare prefix or "<prefix>:<value>", and the popout builds
# each row's list of values from the entries sharing a prefix.
module SearchOperators
  ELASTICSEARCH = %w(
    has:media
    has:poll
    has:embed
    is:reply
    is:sensitive
    language
    from
    before
    during
    after
    in:all
    in:library
    in:public
  ).freeze

  def self.available
    Chewy.enabled? ? ELASTICSEARCH : DatabaseSearchQuery::SUPPORTED_OPERATORS
  end
end
