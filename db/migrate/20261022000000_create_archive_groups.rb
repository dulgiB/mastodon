# frozen_string_literal: true

class CreateArchiveGroups < ActiveRecord::Migration[8.0]
  def change
    create_table :archive_groups do |t|
      t.string :title, null: false, default: ''
      t.integer :position, null: false, default: 0

      t.timestamps
    end

    add_reference :archives, :archive_group, foreign_key: { on_delete: :nullify }, index: true, null: true
  end
end
