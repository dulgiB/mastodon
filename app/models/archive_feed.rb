# frozen_string_literal: true

# Replays the ordinary local timeline, restricted to the status ID range of a
# given Archive, with per-viewer visibility identical to StatusPolicy#show?
# (public/unlisted always, private when followed, direct/limited when
# mentioned or owned), rather than the public-only visibility of PublicFeed.
class ArchiveFeed
  def initialize(archive, viewer)
    @archive = archive
    @viewer = viewer
  end

  # @param [Integer] limit
  # @param [Integer] max_id
  # @param [Integer] since_id
  # @param [Integer] min_id
  # @param [String] query restrict to statuses matching this text (same
  #   pg_trgm-indexed substring match as match?/DatabaseStatusSearch), so
  #   in-episode search can be paginated server-side instead of requiring
  #   the whole episode client-side first
  # @return [Array<Status>]
  def get(limit, max_id: nil, since_id: nil, min_id: nil, query: nil)
    matching_scope(query).to_a_paginated_by_id(limit, max_id: max_id, since_id: since_id, min_id: min_id)
  end

  # Whether this archive contains at least one status visible to the viewer
  # whose text or content warning literally (no stemming) contains `query`,
  # case-insensitively. Used to point a searcher at other episodes when the
  # one they're looking at doesn't have a match.
  # @param [String] query
  # @return [Boolean]
  def match?(query)
    matching_scope(query).exists?
  end

  # The id of the earliest-in-time visible match for `query` that comes
  # after `after_id`, letting the client cycle through in-episode matches
  # one at a time (find-next), the same way a browser's own find-in-page
  # does, rather than jumping straight to another episode whenever the one
  # currently open contains more than one match.
  # @param [String] query
  # @param [Integer, String, nil] after_id
  # @return [Integer, nil]
  def next_match_id(query, after_id: nil)
    relation = matching_scope(query).reorder(id: :asc)
    relation = relation.where(Status.arel_table[:id].gt(after_id)) if after_id.present?
    relation.limit(1).pick(:id)
  end

  # A window of statuses centered on `around_id` — up to `limit` immediately
  # older and `limit` immediately newer, in addition to `around_id` itself —
  # unfiltered by any search query. Used to jump to a specific status (e.g.
  # a search match) while still showing its surrounding, non-matching
  # context, rather than only ever displaying statuses that match.
  # @param [Integer, String] around_id
  # @param [Integer] limit
  # @return [Array<Status>]
  def around(around_id, limit)
    newer = scope.to_a_paginated_by_id(limit, min_id: around_id)
    # `max_id` is exclusive, so `around_id + 1` folds the target status itself
    # into this side's results — pad the limit by one to still get `limit`
    # older statuses in addition to it.
    older = scope.to_a_paginated_by_id(limit + 1, max_id: (around_id.to_i + 1).to_s)

    newer + older
  end

  private

  attr_reader :archive, :viewer

  def scope
    range_scope.merge(visible_scope).merge(Status.not_excluded_by_account(viewer))
  end

  def matching_scope(query)
    query.present? ? scope.merge(Status.matching_text(query)) : scope
  end

  def range_scope
    Status.local.where(id: archive.start_status_id..archive.end_status_id)
  end

  def visible_scope
    StatusVisibility.new(viewer).scope
  end
end
