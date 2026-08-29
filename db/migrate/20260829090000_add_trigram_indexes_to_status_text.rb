# frozen_string_literal: true

# Keeps DatabaseStatusSearch's ILIKE '%term%' substring search fast on
# instances not running Elasticsearch, since a plain B-tree index can't
# serve a leading-wildcard pattern.
class AddTrigramIndexesToStatusText < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def up
    enable_extension 'pg_trgm' unless extension_enabled?('pg_trgm')

    add_index :statuses, :text, using: :gin, opclass: :gin_trgm_ops, algorithm: :concurrently, name: 'index_statuses_on_text_trigram'
    add_index :statuses, :spoiler_text, using: :gin, opclass: :gin_trgm_ops, algorithm: :concurrently, name: 'index_statuses_on_spoiler_text_trigram'
  end

  def down
    remove_index :statuses, name: 'index_statuses_on_text_trigram'
    remove_index :statuses, name: 'index_statuses_on_spoiler_text_trigram'
  end
end
