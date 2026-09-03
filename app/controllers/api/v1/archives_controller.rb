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

  # The id of the next (or, with direction: 'prev', previous) status within
  # this one episode matching the query relative to :after_id, so the
  # client can jump straight to it with its surrounding context instead of
  # filtering the episode down to matches only — letting the search box's
  # Enter key and up/down buttons cycle through matches one at a time, the
  # same way a code editor/document viewer's find bar does. Cross-episode
  # "find next"/"find previous" (the `search` action above, paired with
  # client-side direction handling) only comes into play once this
  # episode's matches are exhausted in that direction.
  #
  # Also carries this match's 1-based position among the episode's total
  # match count (e.g. index 3 of total 10), so the client can show a "3/10"
  # indicator alongside the jump.
  def matches
    archive = Archive.find(params[:id])
    query = params[:q].to_s.strip
    feed = ArchiveFeed.new(archive, current_account)

    if query.blank?
      render json: { id: nil, index: nil, total: 0 }
      return
    end

    id = if params[:direction] == 'prev'
           feed.previous_match_id(query, before_id: params[:after_id])
         else
           feed.next_match_id(query, after_id: params[:after_id])
         end
    index, total = feed.match_position(query, id)

    render json: { id: id&.to_s, index: index, total: total }
  end
end
