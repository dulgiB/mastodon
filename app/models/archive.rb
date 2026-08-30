# frozen_string_literal: true

# == Schema Information
#
# Table name: archives
#
#  id              :bigint(8)        not null, primary key
#  title           :string           default(""), not null
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#  end_status_id   :bigint(8)        not null
#  start_status_id :bigint(8)        not null
#
class Archive < ApplicationRecord
  validates :title, presence: true
  validates :start_status_id, :end_status_id, presence: true, numericality: { only_integer: true, greater_than: 0 }
  validate :end_status_id_not_before_start_status_id

  scope :ordered, -> { order(start_status_id: :asc) }

  def previous
    self.class.where(start_status_id: ...start_status_id).order(start_status_id: :desc).first
  end

  def next
    self.class.where(start_status_id: (start_status_id + 1)..).order(start_status_id: :asc).first
  end

  private

  def end_status_id_not_before_start_status_id
    return if start_status_id.blank? || end_status_id.blank?

    errors.add(:end_status_id, :greater_than_or_equal_to, count: start_status_id) if end_status_id < start_status_id
  end
end
