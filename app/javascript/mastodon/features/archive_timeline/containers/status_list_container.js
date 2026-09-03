import { List as ImmutableList } from 'immutable';
import { connect } from 'react-redux';

import { expandArchiveTimeline, expandArchiveTimelineFromStart, scrollTopTimeline } from 'mastodon/actions/timelines';
import StatusList from 'mastodon/components/status_list';

// Unlike the generic status list container, this does not hide direct-visibility
// statuses: ArchiveFeed already restricts those to ones the viewer is allowed to
// see (authored or mentioned), so nothing further needs to be filtered here.
//
// Browsing an episode is always unfiltered, even while a search is active —
// see ArchiveTimeline, which jumps the whole timeline to a window around a
// match (ArchiveFeed#around) instead of filtering it down to matches only,
// so the matched post's surrounding context stays visible.
const mapStateToProps = (state, { timelineId, order }) => {
  const items = state.getIn(['timelines', timelineId, 'items'], ImmutableList());

  return {
    statusIds: order === 'asc' ? items.reverse() : items,
    isLoading: state.getIn(['timelines', timelineId, 'isLoading'], true),
    isPartial: state.getIn(['timelines', timelineId, 'isPartial'], false),
    hasMore: state.getIn(['timelines', timelineId, 'hasMore'], false),
  };
};

const mapDispatchToProps = (dispatch, { timelineId, episodeId, order }) => ({
  onScrollToTop: () => dispatch(scrollTopTimeline(timelineId, true)),
  onScroll: () => dispatch(scrollTopTimeline(timelineId, false)),
  // The displayed list is reversed for 'asc', so the cursor ScrollableList
  // hands back (the last *displayed* item) is the newest-so-far when
  // walking forward, or the oldest-so-far when walking backward — exactly
  // the right cursor for whichever direction matches the current order.
  onLoadMore: cursor => dispatch(
    order === 'asc'
      ? expandArchiveTimelineFromStart(episodeId, { minId: cursor })
      : expandArchiveTimeline(episodeId, { maxId: cursor })
  ),
});

export default connect(mapStateToProps, mapDispatchToProps)(StatusList);
