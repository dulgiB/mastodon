# frozen_string_literal: true

# pg_trgm cannot index a pattern shorter than three characters, so the one- and
# two-character queries that are ordinary in Korean fell back to a sequential
# scan. pg_bigm indexes 2-grams and serves them; db-image/README.md has the
# measurements.
#
# pg_bigm accelerates LIKE only and its index is case-sensitive, unlike pg_trgm
# which serves ILIKE directly, so the index is built over lower(...) and
# Status.matching_text lowers both sides to match.
#
# Requires a server with pg_bigm installed -- db-image/Dockerfile builds it on
# to the postgres image both instances already run. Deploy that image before
# running this.
class ReplaceStatusTextTrigramIndexesWithBigm < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def up
    enable_extension 'pg_bigm' unless extension_enabled?('pg_bigm')

    # Added before the trigram ones are dropped so no window is left where a
    # search has no index to use.
    add_index :statuses, 'lower(text) gin_bigm_ops', using: :gin, algorithm: :concurrently, name: 'index_statuses_on_text_bigm'
    add_index :statuses, 'lower(spoiler_text) gin_bigm_ops', using: :gin, algorithm: :concurrently, name: 'index_statuses_on_spoiler_text_bigm'

    remove_index :statuses, name: 'index_statuses_on_text_trigram', algorithm: :concurrently
    remove_index :statuses, name: 'index_statuses_on_spoiler_text_trigram', algorithm: :concurrently
  end

  def down
    enable_extension 'pg_trgm' unless extension_enabled?('pg_trgm')

    add_index :statuses, :text, using: :gin, opclass: :gin_trgm_ops, algorithm: :concurrently, name: 'index_statuses_on_text_trigram'
    add_index :statuses, :spoiler_text, using: :gin, opclass: :gin_trgm_ops, algorithm: :concurrently, name: 'index_statuses_on_spoiler_text_trigram'

    remove_index :statuses, name: 'index_statuses_on_text_bigm', algorithm: :concurrently
    remove_index :statuses, name: 'index_statuses_on_spoiler_text_bigm', algorithm: :concurrently
  end
end
