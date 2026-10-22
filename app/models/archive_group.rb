# frozen_string_literal: true

# == Schema Information
#
# Table name: archive_groups
#
#  id         :bigint(8)        not null, primary key
#  title      :string           default(""), not null
#  position   :integer          default(0), not null
#  created_at :datetime         not null
#  updated_at :datetime         not null
#

# A named bucket of archives (e.g. "Act 1, Part 1") so the episode picker can
# show one group's episodes at a time instead of one ever-growing dropdown.
# Groups are ordered by `position`, then creation; deleting a group leaves its
# episodes in place, ungrouped.
class ArchiveGroup < ApplicationRecord
  has_many :archives, dependent: nil

  validates :title, presence: true
  validates :position, numericality: { only_integer: true }

  scope :ordered, -> { order(position: :asc, id: :asc) }
end
