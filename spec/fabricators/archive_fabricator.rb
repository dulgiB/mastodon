# frozen_string_literal: true

Fabricator(:archive) do
  title            { Faker::Lorem.sentence }
  start_status_id  { 1 }
  end_status_id    { 1000 }
end
