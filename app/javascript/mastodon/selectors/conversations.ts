import type { List as ImmutableList, Map as ImmutableMap } from 'immutable';

import type { RootState } from 'mastodon/store';

// state.conversations isn't a typed slice (its reducer is plain JS), so the
// cast is needed to read out of it safely.
export const selectUnreadConversationsCount = (state: RootState) => {
  const conversations = state.conversations as ImmutableMap<string, unknown>;
  const items = conversations.get('items') as
    | ImmutableList<ImmutableMap<string, unknown>>
    | undefined;

  return items?.filter((item) => item.get('unread') as boolean).size ?? 0;
};
