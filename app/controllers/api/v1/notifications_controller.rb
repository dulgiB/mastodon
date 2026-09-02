# frozen_string_literal: true

class Api::V1::NotificationsController < Api::BaseController
  before_action -> { doorkeeper_authorize! :read, :'read:notifications' }, except: [:clear, :dismiss]
  before_action -> { doorkeeper_authorize! :write, :'write:notifications' }, only: [:clear, :dismiss]
  before_action :require_user!
  after_action :insert_pagination_headers, only: :index

  DEFAULT_NOTIFICATIONS_LIMIT = 40
  DEFAULT_NOTIFICATIONS_COUNT_LIMIT = 100
  MAX_NOTIFICATIONS_COUNT_LIMIT = 1_000

  def index
    with_read_replica do
      @notifications = load_notifications
      @relationships = StatusRelationshipsPresenter.new(target_statuses_from_notifications, current_user&.account_id)
    end

    render json: @notifications, each_serializer: REST::NotificationSerializer, relationships: @relationships, supported_notification_types: params[:supported_types]
  end

  def unread_count
    limit = limit_param(DEFAULT_NOTIFICATIONS_COUNT_LIMIT, MAX_NOTIFICATIONS_COUNT_LIMIT)

    with_read_replica do
      count = if mentions_only_request?
                browserable_account_notifications.paginate_groups_by_min_id(limit, min_id: notification_marker&.last_read_id, grouped_types: %w(mention)).count
              else
                browserable_account_notifications.paginate_by_min_id(limit, notification_marker&.last_read_id).count
              end

      render json: { count: count }
    end
  end

  def show
    @notification = current_account.notifications.without_suspended.find(params[:id])
    render json: @notification, serializer: REST::NotificationSerializer, supported_notification_types: params[:supported_types]
  end

  def clear
    current_account.notifications.delete_all
    render_empty
  end

  def dismiss
    current_account.notifications.find(params[:id]).destroy!
    render_empty
  end

  private

  def load_notifications
    scope = browserable_account_notifications.includes(from_account: [:account_stat, :user])

    # A dedicated mentions view collapses same-thread mentions down to the latest one,
    # the same way `Api::V2::NotificationsController` does for clients that have moved
    # to the grouped notifications API — mixed feeds (e.g. "everything") are left
    # ungrouped, exactly as before.
    notifications = if mentions_only_request?
                      scope.to_a_grouped_paginated_by_id(
                        limit_param(DEFAULT_NOTIFICATIONS_LIMIT),
                        params_slice(:max_id, :since_id, :min_id).merge(grouped_types: %w(mention))
                      )
                    else
                      scope.to_a_paginated_by_id(
                        limit_param(DEFAULT_NOTIFICATIONS_LIMIT),
                        params_slice(:max_id, :since_id, :min_id)
                      )
                    end

    Notification.preload_cache_collection_target_statuses(notifications) do |target_statuses|
      preload_collection(target_statuses, Status)
    end
  end

  # True when, after applying both `types` and `exclude_types`, the only notification
  # type left standing is `mention` (ignoring `quote`, which the web UI's "Mentions"
  # quick filter bundles in alongside `mention` via `exclude_types` rather than an
  # explicit `types[]=mention`).
  def mentions_only_request?
    (effective_notification_types - [:quote]) == [:mention]
  end

  def effective_notification_types
    requested = Array(browserable_params[:types]).map(&:to_sym)
    base = requested.empty? ? Notification::TYPES : (requested & Notification::TYPES)
    (base - Array(browserable_params[:exclude_types]).map(&:to_sym)).sort
  end

  def browserable_account_notifications
    current_account.notifications.without_suspended.browserable(
      types: Array(browserable_params[:types]),
      exclude_types: Array(browserable_params[:exclude_types]),
      from_account_id: browserable_params[:account_id],
      include_filtered: truthy_param?(:include_filtered)
    )
  end

  def notification_marker
    current_user.markers.find_by(timeline: 'notifications')
  end

  def target_statuses_from_notifications
    @notifications.reject { |notification| notification.target_status.nil? }.map(&:target_status)
  end

  def next_path
    api_v1_notifications_url pagination_params(max_id: pagination_max_id) unless @notifications.empty?
  end

  def prev_path
    api_v1_notifications_url pagination_params(min_id: pagination_since_id) unless @notifications.empty?
  end

  def pagination_collection
    @notifications
  end

  def browserable_params
    params.permit(:account_id, :include_filtered, types: [], exclude_types: [])
  end

  def pagination_params(core_params)
    params.slice(:limit, :account_id, :types, :exclude_types, :include_filtered, :supported_types)
      .permit(:limit, :account_id, :include_filtered, types: [], exclude_types: [], supported_types: [])
      .merge(core_params)
  end
end
