import { List as ImmutableList } from 'immutable';
import { connect } from 'react-redux';

import { scrollTopTimeline } from 'mastodon/actions/timelines';
import { isNonStatusId } from 'mastodon/actions/timelines_typed';
import StatusList from 'mastodon/components/status_list';

// Unlike the generic status list container, this does not hide direct-visibility
// statuses: ArchiveFeed already restricts those to ones the viewer is allowed to
// see (authored or mentioned), so nothing further needs to be filtered here.
//
// The whole (bounded) episode is already loaded client-side, so a search query
// is applied here as a plain, case-insensitive substring match against each
// status's precomputed `search_index` (spoiler text + content + poll options +
// media descriptions, HTML stripped) — no stemming, no network round-trip, and
// it never surfaces anything beyond what ArchiveFeed already decided is visible
// to this viewer.
const matchesQuery = (statuses, query) => id => {
  if (isNonStatusId(id)) {
    return true;
  }

  const searchIndex = statuses.getIn([id, 'search_index'], '');
  return searchIndex.toLowerCase().includes(query);
};

const mapStateToProps = (state, { timelineId, order, query }) => {
  let items = state.getIn(['timelines', timelineId, 'items'], ImmutableList());

  const normalizedQuery = query?.trim().toLowerCase();
  if (normalizedQuery) {
    items = items.filter(matchesQuery(state.get('statuses'), normalizedQuery));
  }

  return {
    statusIds: order === 'asc' ? items.reverse() : items,
    isLoading: state.getIn(['timelines', timelineId, 'isLoading'], true),
    isPartial: state.getIn(['timelines', timelineId, 'isPartial'], false),
    hasMore: normalizedQuery ? false : state.getIn(['timelines', timelineId, 'hasMore'], false),
  };
};

const mapDispatchToProps = (dispatch, { timelineId }) => ({
  onScrollToTop: () => dispatch(scrollTopTimeline(timelineId, true)),
  onScroll: () => dispatch(scrollTopTimeline(timelineId, false)),
});

export default connect(mapStateToProps, mapDispatchToProps)(StatusList);
