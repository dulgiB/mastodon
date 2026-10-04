import { useEffect } from 'react';

import { watchStatusCounts } from 'mastodon/actions/status_counts';
import { useAppDispatch } from 'mastodon/store';

// Keeps the reply, boost and favourite counts of a post on screen current
export const StatusCountsWatcher: React.FC<{ statusId: string }> = ({
  statusId,
}) => {
  const dispatch = useAppDispatch();

  useEffect(() => watchStatusCounts(statusId, dispatch), [statusId, dispatch]);

  return null;
};
