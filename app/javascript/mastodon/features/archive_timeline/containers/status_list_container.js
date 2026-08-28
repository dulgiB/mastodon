import { List as ImmutableList } from 'immutable';
import { connect } from 'react-redux';

import { scrollTopTimeline } from 'mastodon/actions/timelines';
import StatusList from 'mastodon/components/status_list';

// Unlike the generic status list container, this does not hide direct-visibility
// statuses: ArchiveFeed already restricts those to ones the viewer is allowed to
// see (authored or mentioned), so nothing further needs to be filtered here.
const mapStateToProps = (state, { timelineId, order }) => {
  const items = state.getIn(['timelines', timelineId, 'items'], ImmutableList());

  return {
    statusIds: order === 'asc' ? items.reverse() : items,
    isLoading: state.getIn(['timelines', timelineId, 'isLoading'], true),
    isPartial: state.getIn(['timelines', timelineId, 'isPartial'], false),
    hasMore: state.getIn(['timelines', timelineId, 'hasMore'], false),
  };
};

const mapDispatchToProps = (dispatch, { timelineId }) => ({
  onScrollToTop: () => dispatch(scrollTopTimeline(timelineId, true)),
  onScroll: () => dispatch(scrollTopTimeline(timelineId, false)),
});

export default connect(mapStateToProps, mapDispatchToProps)(StatusList);
