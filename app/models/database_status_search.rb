# frozen_string_literal: true

# Literal, case-insensitive substring search over local statuses, for
# instances not running Elasticsearch (Chewy). Mirrors ArchiveFeed's
# search: no tokenization, decompounding, or stemming, so it has no
# notion of word boundaries or query operators (from:, before:, is:,
# quoted phrases, ...) the way SearchQueryTransformer's Elasticsearch
# queries do — the whole query string is matched as one substring.
# Scoped to what `viewer` may actually see (StatusVisibility), so it
# can't surface anything StatusPolicy#show? would hide from them.
class DatabaseStatusSearch
  def initialize(viewer)
    @viewer = viewer
  end

  # @param [String] query
  # @param [Integer] limit
  # @param [Integer] offset
  # @param [Integer] account_id restrict results to this author, like the
  #   Elasticsearch path's `from:` operator
  # @param [Integer] min_id only statuses newer than this ID (exclusive)
  # @param [Integer] max_id only statuses older than this ID (exclusive)
  # @return [Array<Status>]
  def call(query, limit:, offset: 0, account_id: nil, min_id: nil, max_id: nil)
    results = scope.merge(Status.matching_text(query))
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
