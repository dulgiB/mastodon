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
  # @return [Array<Status>]
  def get(limit, max_id: nil, since_id: nil, min_id: nil)
    scope.to_a_paginated_by_id(limit, max_id: max_id, since_id: since_id, min_id: min_id)
  end

  # Whether this archive contains at least one status visible to the viewer
  # whose text or content warning literally (no stemming) contains `query`,
  # case-insensitively. Used to point a searcher at other episodes when the
  # one they're looking at doesn't have a match.
  # @param [String] query
  # @return [Boolean]
  def match?(query)
    scope.merge(self.class.text_scope(query)).exists?
  end

  # @param [String] query
  def self.text_scope(query)
    pattern = "%#{ActiveRecord::Base.sanitize_sql_like(query)}%"
    Status.where('statuses.text ILIKE :pattern OR statuses.spoiler_text ILIKE :pattern', pattern: pattern)
  end

  private

  attr_reader :archive, :viewer

  def scope
    range_scope.merge(visible_scope).merge(Status.not_excluded_by_account(viewer))
  end

  def range_scope
    Status.local.where(id: archive.start_status_id..archive.end_status_id)
  end

  def visible_scope
    base = Status.joins(:account).left_outer_joins(:mentions).merge(Account.without_suspended)

    return base if privileged_viewer?

    base
      .merge(public_or_unlisted_scope)
      .or(base.where(account_id: viewer.id))
      .or(base.merge(private_and_following_scope))
      .or(base.merge(direct_or_limited_and_mentioned_scope))
      .group(Status.arel_table[:id])
  end

  def public_or_unlisted_scope
    Status.distributable_visibility.where.not(
      account_id: Block.where(target_account_id: viewer.id).select(:account_id)
    )
  end

  def private_and_following_scope
    Status.where(visibility: :private).where(
      account_id: Follow.where(account_id: viewer.id).select(:target_account_id)
    )
  end

  def direct_or_limited_and_mentioned_scope
    Status.where(visibility: %i(direct limited)).where(mentions: { account_id: viewer.id })
  end

  def privileged_viewer?
    (viewer.user&.role || UserRole.nobody).can?(:manage_users, :manage_reports)
  end
end
