# frozen_string_literal: true

class Api::V1::ArchivesController < Api::BaseController
  before_action -> { doorkeeper_authorize! :read, :'read:statuses' }
  before_action :require_user!

  def index
    render json: Archive.ordered, each_serializer: REST::ArchiveSerializer
  end
end
