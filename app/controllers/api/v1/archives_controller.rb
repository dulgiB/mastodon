# frozen_string_literal: true

class Api::V1::ArchivesController < Api::BaseController
  before_action -> { doorkeeper_authorize! :read, :'read:statuses' }
  before_action :require_user!

  def index
    render json: Archive.ordered, each_serializer: REST::ArchiveSerializer
  end

  # Which episodes (besides the one currently open) contain a status matching
  # this query and visible to the current viewer, so the client can offer to
  # jump to them ("find next") when the open episode comes up empty.
  def search
    query = params[:q].to_s.strip

    matches = query.blank? ? [] : Archive.ordered.select { |archive| ArchiveFeed.new(archive, current_account).match?(query) }

    render json: matches, each_serializer: REST::ArchiveSerializer
  end

  # The id of the next status within this one episode matching the query
  # (after :after_id, if given), so the client can jump straight to it with
  # its surrounding context instead of filtering the episode down to
  # matches only. Cross-episode "find next" (the `search` action above)
  # only comes into play once this episode's matches are exhausted.
  def matches
    archive = Archive.find(params[:id])
    query = params[:q].to_s.strip

    id = query.blank? ? nil : ArchiveFeed.new(archive, current_account).next_match_id(query, after_id: params[:after_id])

    render json: { id: id&.to_s }
  end
end
