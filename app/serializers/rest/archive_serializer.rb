# frozen_string_literal: true

class REST::ArchiveSerializer < ActiveModel::Serializer
  attributes :id, :title, :start_status_id, :end_status_id, :group

  def id
    object.id.to_s
  end

  def start_status_id
    object.start_status_id.to_s
  end

  def end_status_id
    object.end_status_id.to_s
  end

  # Embedded rather than a separate endpoint: the picker only ever needs the
  # groups that actually contain episodes, ordered by `position`.
  def group
    return if object.archive_group.nil?

    {
      id: object.archive_group.id.to_s,
      title: object.archive_group.title,
      position: object.archive_group.position,
    }
  end
end
