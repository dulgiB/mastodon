# frozen_string_literal: true

# Filters a Status scope down to what `viewer` may see, replicating
# StatusPolicy#show? in bulk SQL form (public/unlisted always, private
# when followed, direct/limited when mentioned or owned) for callers that
# need to evaluate visibility across many statuses at once instead of one
# at a time. Does not apply block/mute exclusion on its own — combine with
# Status.not_excluded_by_account for that.
class StatusVisibility
  def initialize(viewer)
    @viewer = viewer
  end

  # @param [ActiveRecord::Relation] base
  # @return [ActiveRecord::Relation]
  def scope(base = Status.all)
    scoped = base.joins(:account).left_outer_joins(:mentions).merge(Account.without_suspended)

    return scoped if privileged_viewer?

    scoped
      .merge(public_or_unlisted_scope)
      .or(scoped.where(account_id: viewer.id))
      .or(scoped.merge(private_and_following_scope))
      .or(scoped.merge(direct_or_limited_and_mentioned_scope))
      .group(Status.arel_table[:id])
  end

  private

  attr_reader :viewer

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
