import { Map as ImmutableMap, List as ImmutableList } from 'immutable';

import api, { getLinks } from 'mastodon/api';
import { compareId } from 'mastodon/compare_id';
import { usePendingItems as preferPendingItems } from 'mastodon/initial_state';

import { importFetchedStatus, importFetchedStatuses } from './importer';
import { submitMarkers } from './markers';
import { timelineDelete } from './timelines_typed';

export { disconnectTimeline } from './timelines_typed';

const noOp = () => {};

export const TIMELINE_UPDATE  = 'TIMELINE_UPDATE';
export const TIMELINE_CLEAR   = 'TIMELINE_CLEAR';

export const TIMELINE_EXPAND_REQUEST = 'TIMELINE_EXPAND_REQUEST';
export const TIMELINE_EXPAND_SUCCESS = 'TIMELINE_EXPAND_SUCCESS';
export const TIMELINE_EXPAND_FAIL    = 'TIMELINE_EXPAND_FAIL';

export const TIMELINE_SCROLL_TOP   = 'TIMELINE_SCROLL_TOP';
export const TIMELINE_LOAD_PENDING = 'TIMELINE_LOAD_PENDING';
export const TIMELINE_CONNECT      = 'TIMELINE_CONNECT';

export const TIMELINE_MARK_AS_PARTIAL = 'TIMELINE_MARK_AS_PARTIAL';
export const TIMELINE_INSERT          = 'TIMELINE_INSERT';

// When adding new special markers here, make sure to update TIMELINE_NON_STATUS_MARKERS in actions/timelines_typed.js
export const TIMELINE_SUGGESTIONS = 'inline-follow-suggestions';
export const TIMELINE_GAP = null;
export const TIMELINE_PINNED_VIEW_ALL = 'pinned-view-all';

export const TIMELINE_NON_STATUS_MARKERS = [
  TIMELINE_GAP,
  TIMELINE_SUGGESTIONS,
  TIMELINE_PINNED_VIEW_ALL,
];

export const loadPending = timeline => ({
  type: TIMELINE_LOAD_PENDING,
  timeline,
});

export function updateTimeline(timeline, status, { accept = undefined, bogusQuotePolicy = false } = {}) {
  return (dispatch, getState) => {
    if (typeof accept === 'function' && !accept(status)) {
      return;
    }

    if (getState().getIn(['timelines', timeline, 'isPartial'])) {
      // Prevent new items from being added to a partial timeline,
      // since it will be reloaded anyway

      return;
    }

    dispatch(importFetchedStatus(status, { bogusQuotePolicy }));

    dispatch({
      type: TIMELINE_UPDATE,
      timeline,
      status,
      usePendingItems: preferPendingItems,
    });

    if (timeline === 'home') {
      dispatch(submitMarkers());
    }
  };
}

export function deleteFromTimelines(id) {
  return (dispatch, getState) => {
    const accountId  = getState().getIn(['statuses', id, 'account']);
    const references = getState().get('statuses').filter(status => status.get('reblog') === id).map(status => status.get('id')).valueSeq().toJSON();
    const reblogOf   = getState().getIn(['statuses', id, 'reblog'], null);

    dispatch(timelineDelete({ statusId: id, accountId, references, reblogOf }));
  };
}

export function clearTimeline(timeline) {
  return (dispatch) => {
    dispatch({ type: TIMELINE_CLEAR, timeline });
  };
}

const parseTags = (tags = {}, mode) => {
  return (tags[mode] || []).map((tag) => {
    return tag.value;
  });
};

export function expandTimeline(timelineId, path, params = {}) {
  return async (dispatch, getState) => {
    const timeline = getState().getIn(['timelines', timelineId], ImmutableMap());
    const isLoadingMore = !!params.max_id;

    if (timeline.get('isLoading')) {
      return;
    }

    if (!params.max_id && !params.pinned && (timeline.get('items', ImmutableList()).size + timeline.get('pendingItems', ImmutableList()).size) > 0) {
      const a = timeline.getIn(['pendingItems', 0]);
      const b = timeline.getIn(['items', 0]);

      if (a && b && compareId(a, b) > 0) {
        params.since_id = a;
      } else {
        params.since_id = b || a;
      }
    }

    const isLoadingRecent = !!params.since_id;

    dispatch(expandTimelineRequest(timelineId, isLoadingMore));

    try {
      const response = await api().get(path, { params });
      const next = getLinks(response).refs.find(link => link.rel === 'next');

      dispatch(importFetchedStatuses(response.data));
      dispatch(expandTimelineSuccess(timelineId, response.data, next ? next.uri : null, response.status === 206, isLoadingRecent, isLoadingMore, isLoadingRecent && preferPendingItems));

      // Per instance policy of not surfacing other accounts, the "Who to
      // follow" inline suggestions card is disabled - it briefly showed a
      // loading/empty area in the middle of the home timeline before
      // resolving to nothing (this instance has no other accounts to
      // suggest).
      // if (timelineId === 'home' && !isLoadingMore && !isLoadingRecent) {
      //   const now = new Date();
      //   const fittingIndex = response.data.findIndex(status => now - (new Date(status.created_at)) > 4 * 3600 * 1000);
      //
      //   if (fittingIndex !== -1) {
      //     dispatch(insertIntoTimeline(timelineId, TIMELINE_SUGGESTIONS, Math.max(1, fittingIndex)));
      //   }
      // }

      if (timelineId === 'home') {
        dispatch(submitMarkers());
      }
    } catch(error) {
      dispatch(expandTimelineFail(timelineId, error, isLoadingMore));
    }
  };
}

export function fillTimelineGaps(timelineId, path, params = {}) {
  return async (dispatch, getState) => {
    const timeline = getState().getIn(['timelines', timelineId], ImmutableMap());
    const items = timeline.get('items');
    const nullIndexes = items.map((statusId, index) => statusId === null ? index : null);
    const gaps = nullIndexes.map(index => index > 0 ? items.get(index - 1) : null);

    // Only expand at most two gaps to avoid doing too many requests
    for (const maxId of gaps.take(2)) {
      await dispatch(expandTimeline(timelineId, path, { ...params, maxId }));
    }
  };
}

export const expandHomeTimeline            = ({ maxId } = {}, done = noOp) => expandTimeline('home', '/api/v1/timelines/home', { max_id: maxId }, done);
export const expandPublicTimeline          = ({ maxId, onlyMedia, onlyRemote } = {}, done = noOp) => expandTimeline(`public${onlyRemote ? ':remote' : ''}${onlyMedia ? ':media' : ''}`, '/api/v1/timelines/public', { remote: !!onlyRemote, max_id: maxId, only_media: !!onlyMedia }, done);
export const expandCommunityTimeline       = ({ maxId, onlyMedia } = {}, done = noOp) => expandTimeline(`community${onlyMedia ? ':media' : ''}`, '/api/v1/timelines/public', { local: true, max_id: maxId, only_media: !!onlyMedia }, done);
export const expandAccountTimeline         = (accountId, { maxId, withReplies, tagged } = {}) => expandTimeline(`account:${accountId}${withReplies ? ':with_replies' : ''}${tagged ? `:${tagged}` : ''}`, `/api/v1/accounts/${accountId}/statuses`, { no_direct: true, exclude_replies: !withReplies, exclude_reblogs: withReplies, tagged, max_id: maxId });
export const expandAccountDirectTimeline    = (accountId, { maxId} = {}) => expandTimeline(`account:${accountId}:with_replies`, `/api/v1/accounts/${accountId}/statuses`, { exclude_replies: false, only_direct: true, exclude_reblogs: true, max_id: maxId });
export const expandAccountFeaturedTimeline = (accountId, { tagged } = {}) => expandTimeline(`account:${accountId}:pinned${tagged ? `:${tagged}` : ''}`, `/api/v1/accounts/${accountId}/statuses`, { pinned: true, tagged });
export const expandAccountMediaTimeline    = (accountId, { maxId, withReplies } = {}) => expandTimeline(`account:${accountId}:media${withReplies ? ':with_replies' : ''}`, `/api/v1/accounts/${accountId}/statuses`, { max_id: maxId, only_media: true, no_direct: true, limit: 40, exclude_replies: !withReplies });
export const expandListTimeline            = (id, { maxId } = {}) => expandTimeline(`list:${id}`, `/api/v1/timelines/list/${id}`, { max_id: maxId });
export const expandArchiveTimeline         = (id, { maxId } = {}) => expandTimeline(`archive:${id}`, `/api/v1/timelines/archive/${id}`, { max_id: maxId });
export const expandLinkTimeline            = (url, { maxId } = {}) => expandTimeline(`link:${url}`, `/api/v1/timelines/link`, { url, max_id: maxId });
export const expandHashtagTimeline         = (hashtag, { maxId, tags, local } = {}, done = noOp) => {
  return expandTimeline(`hashtag:${hashtag}${local ? ':local' : ''}`, `/api/v1/timelines/tag/${hashtag}`, {
    max_id: maxId,
    any:    parseTags(tags, 'any'),
    all:    parseTags(tags, 'all'),
    none:   parseTags(tags, 'none'),
    local:  local,
  });
};

// Default archive page size, chosen explicitly rather than relying on the
// API's own default so hasMore can be inferred from a full page coming
// back, without parsing Link headers.
const ARCHIVE_PAGE_SIZE = 20;

// How many statuses to pull on each side of a search-match jump — mirrors
// ARCHIVE_CONTEXT_LIMIT on the server (see
// Api::V1::Timelines::ArchiveController).
const ARCHIVE_CONTEXT_LIMIT = 15;

// Unlike expandArchiveTimeline (which walks backward from the newest post,
// like every other timeline), this walks forward from the start of the
// episode via min_id, so pages arrive in the same oldest-first order the
// archive column displays by default — letting the column show and grow the
// list as pages load. The column switches between this and
// expandArchiveTimeline depending on the selected order (see
// ArchiveTimeline#loadPage), rather than needing the whole episode loaded
// up front to support reversing/filtering it client-side.
export function expandArchiveTimelineFromStart(id, { minId } = {}) {
  return async dispatch => {
    const timelineId = `archive:${id}`;
    const isLoadingMore = !!minId;

    dispatch(expandTimelineRequest(timelineId, isLoadingMore));

    try {
      const response = await api().get(`/api/v1/timelines/archive/${id}`, { params: { min_id: minId || '0', limit: ARCHIVE_PAGE_SIZE } });
      const hasMore = response.data.length === ARCHIVE_PAGE_SIZE;

      dispatch(importFetchedStatuses(response.data));
      dispatch(expandTimelineSuccess(timelineId, response.data, hasMore ? 'more' : null, response.status === 206, false, isLoadingMore, false));
    } catch (error) {
      dispatch(expandTimelineFail(timelineId, error, isLoadingMore));
    }
  };
}

// Fetches a window of statuses centered on `aroundId` (unfiltered) and
// replaces the episode's timeline with it — used to jump to a specific
// status (e.g. a search match) while keeping its surrounding, non-matching
// context visible, rather than filtering the episode down to matches only.
// `order` decides which side of the window continues to page in as an
// ordinary "load more" (see ArchiveTimeline#loadPage): the other side has
// to be paged in via expandArchiveTimelinePrev instead, since ScrollableList
// only ever loads more at the *bottom* of the list. Resolves to whether
// that other, "prev" side has more left to load.
//
// Whether each side has more is inferred from whether it came back full
// (ARCHIVE_CONTEXT_LIMIT statuses), the same way expandArchiveTimelineFromStart
// infers hasMore from a full page — rather than from the response's Link
// header, which the archive API (like every other Mastodon timeline
// endpoint) includes unconditionally whenever the page isn't fully empty,
// regardless of whether more actually follows.
export function expandArchiveTimelineAround(id, aroundId, order) {
  return async dispatch => {
    const timelineId = `archive:${id}`;

    dispatch(expandTimelineRequest(timelineId, false));

    try {
      const response = await api().get(`/api/v1/timelines/archive/${id}`, { params: { around_id: aroundId, limit: ARCHIVE_CONTEXT_LIMIT } });
      const statuses = response.data;
      const newerCount = statuses.filter(status => compareId(status.id, aroundId) > 0).length;
      // The server's own older-side fetch includes aroundId itself (see
      // ArchiveFeed#around), so a full older side comes back as
      // ARCHIVE_CONTEXT_LIMIT statuses total, aroundId included.
      const olderOrEqualCount = statuses.length - newerCount;
      const hasOlder = olderOrEqualCount === ARCHIVE_CONTEXT_LIMIT;
      const hasNewer = newerCount === ARCHIVE_CONTEXT_LIMIT;
      const hasForward = order === 'asc' ? hasNewer : hasOlder;
      const hasPrev = order === 'asc' ? hasOlder : hasNewer;

      dispatch(importFetchedStatuses(statuses));
      // Cleared here, right before the replacement page lands, rather than by the
      // caller up front — expandNormalizedTimeline below only ever merges into
      // whatever's already in the timeline, so a wholesale replace still needs a
      // clear, but doing it earlier left the list visibly empty for the length of
      // the request (a flash on every jump, including cycling through matches
      // with Enter). Both dispatches land in the same tick, so React batches them
      // into one render straight from the old window to the new one.
      dispatch(clearTimeline(timelineId));
      dispatch(expandTimelineSuccess(timelineId, statuses, hasForward ? 'more' : null, response.status === 206, false, false, false));

      return hasPrev;
    } catch (error) {
      dispatch(expandTimelineFail(timelineId, error, false));
      return false;
    }
  };
}

// Pages in more statuses at the *opposite* end from the one ScrollableList's
// own onLoadMore paginates (see expandArchiveTimelineAround above) — older
// statuses when order is 'asc' (since onLoadMore there already walks
// forward/newer), newer statuses when order is 'desc'. Merged into the same
// timeline via expandTimelineSuccess like any other page, but with a
// perpetually-truthy `next` so it never touches the timeline's shared
// `hasMore` flag, which already tracks the *other* direction.
export function expandArchiveTimelinePrev(id, { cursor, order }) {
  return async dispatch => {
    const timelineId = `archive:${id}`;
    const params = order === 'asc'
      ? { max_id: cursor, limit: ARCHIVE_PAGE_SIZE }
      : { min_id: cursor, limit: ARCHIVE_PAGE_SIZE };

    dispatch(expandTimelineRequest(timelineId, true));

    try {
      const response = await api().get(`/api/v1/timelines/archive/${id}`, { params });
      const hasMore = response.data.length === ARCHIVE_PAGE_SIZE;

      dispatch(importFetchedStatuses(response.data));
      dispatch(expandTimelineSuccess(timelineId, response.data, 'more', response.status === 206, false, true, false));

      return hasMore;
    } catch (error) {
      dispatch(expandTimelineFail(timelineId, error, true));
      return false;
    }
  };
}

export const fillHomeTimelineGaps      = () => fillTimelineGaps('home', '/api/v1/timelines/home', {});
export const fillPublicTimelineGaps    = ({ onlyMedia, onlyRemote } = {}) => fillTimelineGaps(`public${onlyRemote ? ':remote' : ''}${onlyMedia ? ':media' : ''}`, '/api/v1/timelines/public', { remote: !!onlyRemote, only_media: !!onlyMedia });
export const fillCommunityTimelineGaps = ({ onlyMedia } = {}) => fillTimelineGaps(`community${onlyMedia ? ':media' : ''}`, '/api/v1/timelines/public', { local: true, only_media: !!onlyMedia });
export const fillListTimelineGaps      = (id) => fillTimelineGaps(`list:${id}`, `/api/v1/timelines/list/${id}`, {});

export function expandTimelineRequest(timeline, isLoadingMore) {
  return {
    type: TIMELINE_EXPAND_REQUEST,
    timeline,
    skipLoading: !isLoadingMore,
  };
}

export function expandTimelineSuccess(timeline, statuses, next, partial, isLoadingRecent, isLoadingMore, usePendingItems) {
  return {
    type: TIMELINE_EXPAND_SUCCESS,
    timeline,
    statuses,
    next,
    partial,
    isLoadingRecent,
    usePendingItems,
    skipLoading: !isLoadingMore,
  };
}

export function expandTimelineFail(timeline, error, isLoadingMore) {
  return {
    type: TIMELINE_EXPAND_FAIL,
    timeline,
    error,
    skipLoading: !isLoadingMore,
    skipNotFound: timeline.startsWith('account:'),
  };
}

export function scrollTopTimeline(timeline, top) {
  return {
    type: TIMELINE_SCROLL_TOP,
    timeline,
    top,
  };
}

export function connectTimeline(timeline) {
  return {
    type: TIMELINE_CONNECT,
    timeline,
    usePendingItems: preferPendingItems,
  };
}

export const markAsPartial = timeline => ({
  type: TIMELINE_MARK_AS_PARTIAL,
  timeline,
});

export const insertIntoTimeline = (timeline, key, index) => ({
  type: TIMELINE_INSERT,
  timeline,
  index,
  key,
});
