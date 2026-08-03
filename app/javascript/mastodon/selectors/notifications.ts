import { createSelector } from '@reduxjs/toolkit';

import { compareId } from 'mastodon/compare_id';
import type { NotificationGroup } from 'mastodon/models/notification_group';
import type { NotificationGap } from 'mastodon/reducers/notification_groups';
import type { RootState } from 'mastodon/store';

import {
  selectSettingsNotificationsExcludedTypes,
  selectSettingsNotificationsQuickFilterActive,
  selectSettingsNotificationsQuickFilterShow,
} from './settings';

// A reply to a direct message is still delivered as an ordinary 'mention'
// notification server-side (there's no separate type for it), but it
// belongs in the Direct Messages tab, not mixed into Notifications — so it
// never reaches the list, the unread count, or the badge here.
const isDirectMessageMention = (
  item: NotificationGroup | NotificationGap,
  statuses: RootState['statuses'],
) =>
  item.type === 'mention' &&
  !!item.statusId &&
  statuses.get(item.statusId)?.get('visibility') === 'direct';

const filterNotificationsByAllowedTypes = (
  showFilterBar: boolean,
  allowedType: string,
  excludedTypes: string[],
  notifications: (NotificationGroup | NotificationGap)[],
  statuses: RootState['statuses'],
) => {
  const withoutDirectMessages = notifications.filter(
    (item) => !isDirectMessageMention(item, statuses),
  );

  if (!showFilterBar || allowedType === 'all') {
    // used if user changed the notification settings after loading the notifications from the server
    // otherwise a list of notifications will come pre-filtered from the backend
    // we need to turn it off for FilterBar in order not to block ourselves from seeing a specific category
    return withoutDirectMessages.filter(
      (item) => item.type === 'gap' || !excludedTypes.includes(item.type),
    );
  }
  return withoutDirectMessages.filter(
    (item) =>
      item.type === 'gap' ||
      allowedType === item.type ||
      (allowedType === 'mention' && item.type === 'quote') ||
      (allowedType === 'collection' &&
        (item.type === 'collection_update' ||
          item.type === 'added_to_collection')),
  );
};

export const selectNotificationGroups = createSelector(
  [
    selectSettingsNotificationsQuickFilterShow,
    selectSettingsNotificationsQuickFilterActive,
    selectSettingsNotificationsExcludedTypes,
    (state: RootState) => state.notificationGroups.groups,
    (state: RootState) => state.statuses,
  ],
  filterNotificationsByAllowedTypes,
);

const selectPendingNotificationGroups = createSelector(
  [
    selectSettingsNotificationsQuickFilterShow,
    selectSettingsNotificationsQuickFilterActive,
    selectSettingsNotificationsExcludedTypes,
    (state: RootState) => state.notificationGroups.pendingGroups,
    (state: RootState) => state.statuses,
  ],
  filterNotificationsByAllowedTypes,
);

export const selectUnreadNotificationGroupsCount = createSelector(
  [
    (s: RootState) => s.notificationGroups.lastReadId,
    selectNotificationGroups,
    selectPendingNotificationGroups,
  ],
  (notificationMarker, groups, pendingGroups) => {
    return (
      groups.filter(
        (group) =>
          group.type !== 'gap' &&
          group.page_max_id &&
          compareId(group.page_max_id, notificationMarker) > 0,
      ).length +
      pendingGroups.filter(
        (group) =>
          group.type !== 'gap' &&
          group.page_max_id &&
          compareId(group.page_max_id, notificationMarker) > 0,
      ).length
    );
  },
);

// Whether there is any unread notification according to the user-facing state
export const selectAnyPendingNotification = createSelector(
  [
    (s: RootState) => s.notificationGroups.readMarkerId,
    selectNotificationGroups,
  ],
  (notificationMarker, groups) => {
    return groups.some(
      (group) =>
        group.type !== 'gap' &&
        group.page_max_id &&
        compareId(group.page_max_id, notificationMarker) > 0,
    );
  },
);

export const selectPendingNotificationGroupsCount = createSelector(
  [selectPendingNotificationGroups],
  (pendingGroups) =>
    pendingGroups.filter((group) => group.type !== 'gap').length,
);
