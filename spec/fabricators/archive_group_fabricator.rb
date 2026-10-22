# frozen_string_literal: true

Fabricator(:archive_group) do
  title    { Faker::Lorem.words(number: 2).join(' ') }
  position { 0 }
end
