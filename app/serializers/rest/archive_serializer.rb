# frozen_string_literal: true

class REST::ArchiveSerializer < ActiveModel::Serializer
  attributes :id, :title, :start_status_id, :end_status_id

  def id
    object.id.to_s
  end

  def start_status_id
    object.start_status_id.to_s
  end

  def end_status_id
    object.end_status_id.to_s
  end
end
