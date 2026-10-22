# frozen_string_literal: true

class CreateArchiveGroups < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  def change
    create_table :archive_groups do |t|
      t.string :title, null: false, default: ''
      t.integer :position, null: false, default: 0

      t.timestamps
    end

    # archives holds a few dozen admin-defined rows, so the brief lock the
    # foreign key takes is harmless.
    safety_assured { add_reference :archives, :archive_group, null: true, foreign_key: { on_delete: :nullify }, index: false }
    add_index :archives, :archive_group_id, algorithm: :concurrently
  end
end
