import { createAction } from '@reduxjs/toolkit';

import { apiGetStatuses } from 'mastodon/api/statuses';
import type { AppDispatch } from 'mastodon/store';

export interface StatusCounts {
  id: string;
  replies_count: number;
  reblogs_count: number;
  favourites_count: number;
  quotes_count: number;
}

export const statusCountsRefreshed = createAction<StatusCounts[]>(
  'statuses/countsRefreshed',
);

// How often the counts of the posts on screen are asked for again
const REFRESH_INTERVAL = 30 * 1000;
// What /api/v1/statuses takes in one request
const BATCH_SIZE = 20;

// Every action bar on screen holds its post here; a post shown twice
// (a boost and its original, a thread and a timeline) counts twice
const watched = new Map<string, number>();

let dispatch: AppDispatch | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

const refresh = async () => {
  if (!dispatch || inFlight || watched.size === 0 || document.hidden) {
    return;
  }

  inFlight = true;

  const ids = Array.from(watched.keys());

  try {
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const statuses = await apiGetStatuses(ids.slice(i, i + BATCH_SIZE));

      dispatch(
        statusCountsRefreshed(
          statuses.map((status) => ({
            id: status.id,
            replies_count: status.replies_count,
            reblogs_count: status.reblogs_count,
            // The API sends favourites_count; the type spells it the US way
            favourites_count: (status as unknown as StatusCounts)
              .favourites_count,
            quotes_count: status.quotes_count,
          })),
        ),
      );
    }
  } catch {
    // A missed round is made up by the next one
  } finally {
    inFlight = false;
  }
};

const handleVisibilityChange = () => {
  if (!document.hidden) {
    void refresh();
  }
};

const start = () => {
  timer = setInterval(() => void refresh(), REFRESH_INTERVAL);
  document.addEventListener('visibilitychange', handleVisibilityChange);
};

const stop = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  document.removeEventListener('visibilitychange', handleVisibilityChange);
};

export const watchStatusCounts = (
  statusId: string,
  appDispatch: AppDispatch,
) => {
  dispatch = appDispatch;
  watched.set(statusId, (watched.get(statusId) ?? 0) + 1);

  if (!timer) {
    start();
  }

  return () => {
    const count = (watched.get(statusId) ?? 1) - 1;

    if (count > 0) {
      watched.set(statusId, count);
    } else {
      watched.delete(statusId);
    }

    if (watched.size === 0) {
      stop();
    }
  };
};
