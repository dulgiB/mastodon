# frozen_string_literal: true

# Counts unread notifications for the other accounts this browser holds
# sessions for, so the account switcher can show them without the web UI ever
# holding those accounts' credentials.
#
# The count follows what the account would see on its own notifications
# column: groups newer than its read marker, with the types it hides in its
# column settings left out and follows grouped the way it chose. It is capped
# the same way the navigation badge caps its own count.
class MultiSession::UnreadCounter
  LIMIT = 40

  # Mirrors the defaults of `notifications.shows` in the web UI's settings
  # reducer, for accounts that never changed them.
  HIDDEN_BY_DEFAULT = %w(follow_request).freeze

  def initialize(user)
    @user = user
  end

  # Returns LIMIT + 1 when there are more than LIMIT, so the client can tell
  # "exactly 40" apart from "more than 40".
  def count
    @user.account.notifications.without_suspended
      .browserable(exclude_types: excluded_types)
      .paginate_groups_by_min_id(LIMIT + 1, min_id: last_read_id, grouped_types: grouped_types)
      .count
  end

  private

  def last_read_id
    @user.markers.find_by(timeline: 'notifications')&.last_read_id
  end

  def excluded_types
    shows = notification_settings['shows']
    shows = {} unless shows.is_a?(Hash)

    hidden = HIDDEN_BY_DEFAULT.reject { |key| shows[key] == true }
    hidden += shows.filter_map { |key, value| key if value == false }

    hidden.uniq.flat_map { |key| key == 'collections' ? %w(collection_update added_to_collection) : [key] }
  end

  def grouped_types
    group = notification_settings['group']
    group_follows = !(group.is_a?(Hash) && group['follow'] == false)

    group_follows ? %w(favourite reblog follow) : %w(favourite reblog)
  end

  def notification_settings
    @notification_settings ||= begin
      data = Web::Setting.find_by(user: @user)&.data
      value = data.is_a?(Hash) ? data['notifications'] : nil
      value.is_a?(Hash) ? value : {}
    end
  end
end
