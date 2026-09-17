# frozen_string_literal: true

# Literal, case-insensitive substring search over local statuses, for
# instances not running Elasticsearch (Chewy). Mirrors ArchiveFeed's
# search: no tokenization, decompounding, or stemming, so it has no
# notion of word boundaries the way SearchQueryTransformer's
# Elasticsearch queries do — the text is matched as one substring.
# Operators are understood, though: DatabaseSearchQuery lifts the ones
# backed by a `statuses` column (from:, before:, after:, during:,
# language:, is:reply, is:sensitive, has:poll) out of the query and
# turns them into scopes. Scoped to what `viewer` may actually see
# (StatusVisibility), so it can't surface anything StatusPolicy#show?
# would hide from them.
class DatabaseStatusSearch
  def initialize(viewer)
    @viewer = viewer
  end

  # @param [String] query text to match, plus any operators to apply
  # @param [Integer] limit
  # @param [Integer] offset
  # @param [Integer] account_id restrict results to this author, the API
  #   parameter behind the `from:` operator
  # @param [Integer] min_id only statuses newer than this ID (exclusive)
  # @param [Integer] max_id only statuses older than this ID (exclusive)
  # @return [Array<Status>]
  def call(query, limit:, offset: 0, account_id: nil, min_id: nil, max_id: nil)
    parsed = DatabaseSearchQuery.new(query, viewer)
    return [] if parsed.impossible?

    results = parsed.apply(scope)
    results = results.merge(Status.matching_text(parsed.text)) if parsed.text
    results = results.where(account_id: account_id) if account_id.present?
    results = results.where(Status.arel_table[:id].gt(min_id)) if min_id.present?
    results = results.where(Status.arel_table[:id].lt(max_id)) if max_id.present?
    results.reorder(id: :desc).limit(limit).offset(offset).to_a
  end

  private

  attr_reader :viewer

  def scope
    Status.local.merge(StatusVisibility.new(viewer).scope).merge(Status.not_excluded_by_account(viewer))
  end
end
