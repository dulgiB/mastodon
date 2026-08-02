import { throttle } from 'lodash';

import api, { getLinks } from '../api';
import { me } from '../initial_state';

import {
  importFetchedAccounts,
  importFetchedStatuses,
  importFetchedStatus,
} from './importer';

export const CONVERSATIONS_MOUNT   = 'CONVERSATIONS_MOUNT';
export const CONVERSATIONS_UNMOUNT = 'CONVERSATIONS_UNMOUNT';

export const CONVERSATIONS_FETCH_REQUEST = 'CONVERSATIONS_FETCH_REQUEST';
export const CONVERSATIONS_FETCH_SUCCESS = 'CONVERSATIONS_FETCH_SUCCESS';
export const CONVERSATIONS_FETCH_FAIL    = 'CONVERSATIONS_FETCH_FAIL';
export const CONVERSATIONS_UPDATE        = 'CONVERSATIONS_UPDATE';

export const CONVERSATIONS_READ = 'CONVERSATIONS_READ';

export const CONVERSATIONS_TYPING_SET   = 'CONVERSATIONS_TYPING_SET';
export const CONVERSATIONS_TYPING_CLEAR = 'CONVERSATIONS_TYPING_CLEAR';

// How long a received typing signal stays visible before it self-expires (no
// "stopped typing" event is sent — the indicator just times out).
const TYPING_TIMEOUT = 6000;

export const CONVERSATIONS_DELETE_REQUEST = 'CONVERSATIONS_DELETE_REQUEST';
export const CONVERSATIONS_DELETE_SUCCESS = 'CONVERSATIONS_DELETE_SUCCESS';
export const CONVERSATIONS_DELETE_FAIL    = 'CONVERSATIONS_DELETE_FAIL';

export const mountConversations = () => ({
  type: CONVERSATIONS_MOUNT,
});

export const unmountConversations = () => ({
  type: CONVERSATIONS_UNMOUNT,
});

export const markConversationRead = conversationId => (dispatch) => {
  dispatch({
    type: CONVERSATIONS_READ,
    id: conversationId,
  });

  api().post(`/api/v1/conversations/${conversationId}/read`);
};

export const expandConversations = ({ maxId } = {}) => (dispatch, getState) => {
  dispatch(expandConversationsRequest());

  const params = { max_id: maxId };

  if (!maxId) {
    params.since_id = getState().getIn(['conversations', 'items', 0, 'last_status']);
  }

  const isLoadingRecent = !!params.since_id;

  api().get('/api/v1/conversations', { params })
    .then(response => {
      const next = getLinks(response).refs.find(link => link.rel === 'next');

      dispatch(importFetchedAccounts(response.data.reduce((aggr, item) => aggr.concat(item.accounts), [])));
      dispatch(importFetchedStatuses(response.data.map(item => item.last_status).filter(x => !!x)));
      dispatch(expandConversationsSuccess(response.data, next ? next.uri : null, isLoadingRecent));
    })
    .catch(err => dispatch(expandConversationsFail(err)));
};

export const expandConversationsRequest = () => ({
  type: CONVERSATIONS_FETCH_REQUEST,
});

export const expandConversationsSuccess = (conversations, next, isLoadingRecent) => ({
  type: CONVERSATIONS_FETCH_SUCCESS,
  conversations,
  next,
  isLoadingRecent,
});

export const expandConversationsFail = error => ({
  type: CONVERSATIONS_FETCH_FAIL,
  error,
});

export const updateConversations = conversation => dispatch => {
  dispatch(importFetchedAccounts(conversation.accounts));

  if (conversation.last_status) {
    dispatch(importFetchedStatus(conversation.last_status));
  }

  dispatch({
    type: CONVERSATIONS_UPDATE,
    conversation,
  });
};

export const deleteConversation = conversationId => (dispatch) => {
  dispatch(deleteConversationRequest(conversationId));

  api().delete(`/api/v1/conversations/${conversationId}`)
    .then(() => dispatch(deleteConversationSuccess(conversationId)))
    .catch(error => dispatch(deleteConversationFail(conversationId, error)));
};

export const deleteConversationRequest = id => ({
  type: CONVERSATIONS_DELETE_REQUEST,
  id,
});

export const deleteConversationSuccess = id => ({
  type: CONVERSATIONS_DELETE_SUCCESS,
  id,
});

export const deleteConversationFail = (id, error) => ({
  type: CONVERSATIONS_DELETE_FAIL,
  id,
  error,
});

// A typing signal was received over the direct stream: show it, then schedule
// its expiry. The clear is tagged with `at` so a fresher signal is not wiped.
export const updateTyping = ({ accountId }) => (dispatch) => {
  if (!accountId || String(accountId) === String(me)) {
    return;
  }

  const id = String(accountId);
  const at = Date.now();

  dispatch({ type: CONVERSATIONS_TYPING_SET, accountId: id, at });

  setTimeout(() => {
    dispatch({ type: CONVERSATIONS_TYPING_CLEAR, accountId: id, at });
  }, TYPING_TIMEOUT);
};

// Client-side throttle so we hit the endpoint at most once every few seconds
// while the user keeps typing (the server debounces again as a safety net).
const requestTyping = throttle(conversationId => {
  api().post(`/api/v1/conversations/${conversationId}/typing`);
}, 3000, { leading: true, trailing: false });

export const findConversationIdForStatus = (state, statusId) => {
  const items = state.getIn(['conversations', 'items']);
  const targetAccountId = state.getIn(['statuses', statusId, 'account']);

  const match = items.find(conversation => (
    conversation.get('last_status') === statusId ||
    conversation.get('accounts').includes(targetAccountId)
  ));

  return match ? match.get('id') : null;
};

// Called as the user types in the composer; only fires for direct replies that
// map to a known conversation.
export const sendComposeTyping = () => (dispatch, getState) => {
  const state = getState();

  if (state.getIn(['compose', 'privacy']) !== 'direct') {
    return;
  }

  const inReplyTo = state.getIn(['compose', 'in_reply_to']);

  if (!inReplyTo) {
    return;
  }

  const conversationId = findConversationIdForStatus(state, inReplyTo);

  if (conversationId) {
    requestTyping(conversationId);
  }
};
