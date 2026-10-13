import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { me, sessionAccountIds } from 'mastodon/initial_state';
import { fetchSessionUnreadCounts } from 'mastodon/utils/switch_account';

type Counts = Record<string, number>;

const hasOtherSessions = sessionAccountIds.some(
  (accountId) => accountId !== me,
);

// Shared between the navigation panel's account switcher and the mobile
// navigation bar, so that both read one set of counts from one request.
let counts: Counts = {};
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const getSnapshot = () => counts;

const refresh = () => {
  if (!hasOtherSessions || inFlight) {
    return;
  }

  inFlight = fetchSessionUnreadCounts()
    .then((result) => {
      counts = result;
      listeners.forEach((listener) => {
        listener();
      });
    })
    .catch((error: unknown) => {
      console.error('Failed to fetch unread counts for other accounts', error);
    })
    .finally(() => {
      inFlight = null;
    });
};

const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    refresh();
  }
};

const subscribe = (listener: () => void) => {
  if (listeners.size === 0 && hasOtherSessions) {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  listeners.add(listener);

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0) {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };
};

/**
 * Unread notifications on the browser's other accounts, keyed by account id.
 *
 * No stream reaches this page for accounts other than its own, so the counts
 * are fetched when the page loads and whenever the tab comes back into view.
 * The returned function fetches them again, for when the switcher opens.
 */
export const useSessionUnreadCounts = () => {
  const value = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    refresh();
  }, []);

  const refetch = useCallback(() => {
    refresh();
  }, []);

  return [value, refetch] as const;
};

export const hasUnreadInOtherSessions = (value: Counts) =>
  Object.entries(value).some(
    ([accountId, count]) => accountId !== me && count > 0,
  );
