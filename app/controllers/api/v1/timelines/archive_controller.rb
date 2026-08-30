# frozen_string_literal: true

class Api::V1::Timelines::ArchiveController < Api::V1::Timelines::BaseController
  before_action -> { doorkeeper_authorize! :read, :'read:statuses' }
  before_action :require_user!
  before_action :set_archive

  PERMITTED_PARAMS = %i(limit q).freeze

  def show
    @statuses = load_statuses
    render json: @statuses, each_serializer: REST::StatusSerializer, relationships: StatusRelationshipsPresenter.new(@statuses, current_user.account_id)
  end

  private

  def set_archive
    @archive = Archive.find(params[:id])
  end

  def load_statuses
    preloaded_archive_statuses
  end

  def preloaded_archive_statuses
    preload_collection(archive_statuses, Status)
  end

  def archive_statuses
    archive_feed.get(
      limit_param(DEFAULT_STATUSES_LIMIT),
      max_id: params[:max_id],
      since_id: params[:since_id],
      min_id: params[:min_id],
      query: params[:q]
    )
  end

  def archive_feed
    ArchiveFeed.new(@archive, current_account)
  end

  def next_path
    api_v1_timelines_archive_url params[:id], next_path_params
  end

  def prev_path
    api_v1_timelines_archive_url params[:id], prev_path_params
  end
end
