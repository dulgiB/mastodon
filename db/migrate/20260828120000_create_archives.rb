# frozen_string_literal: true

class CreateArchives < ActiveRecord::Migration[8.0]
  def change
    create_table :archives do |t|
      t.string :title, null: false, default: ''
      t.bigint :start_status_id, null: false
      t.bigint :end_status_id, null: false

      t.timestamps
    end
  end
end
