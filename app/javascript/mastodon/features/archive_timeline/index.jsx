import PropTypes from 'prop-types';
import { createRef, PureComponent } from 'react';

import { FormattedMessage } from 'react-intl';

import { Helmet } from '@unhead/react/helmet';
import { withRouter } from 'react-router-dom';

import { List as ImmutableList } from 'immutable';
import { connect } from 'react-redux';

import { debounce } from 'lodash';

import InventoryIcon from '@/material-icons/400-24px/inventory_2.svg?react';
import { injectIntl } from '@/mastodon/components/intl';
import { clearTimeline, expandArchiveTimeline, expandArchiveTimelineAround, expandArchiveTimelineFromStart, expandArchiveTimelinePrev } from 'mastodon/actions/timelines';
import api from 'mastodon/api';
import { compareId } from 'mastodon/compare_id';
import Column from 'mastodon/components/column';
import ColumnHeader from 'mastodon/components/column_header';
import { ColumnSearchHeader } from 'mastodon/components/column_search_header';
import { identityContextPropShape, withIdentity } from 'mastodon/identity_context';
import { WithRouterPropTypes } from 'mastodon/utils/react_router';

import EpisodePicker from './components/episode_picker';
import ArchiveStatusListContainer from './containers/status_list_container';
import { applyHighlight, clearHighlight } from './util/highlight';

// How many animation frames to keep retrying a scroll-to-match before
// giving up — covers the gap between a jump's fetch resolving and the
// matching status actually landing in the DOM.
const SCROLL_RETRY_FRAMES = 30;

class ArchiveTimeline extends PureComponent {

  static propTypes = {
    params: PropTypes.object.isRequired,
    dispatch: PropTypes.func.isRequired,
    columnId: PropTypes.string,
    multiColumn: PropTypes.bool,
    intl: PropTypes.object.isRequired,
    identity: identityContextPropShape,
    ...WithRouterPropTypes,
  };

  state = {
    archives: null,
    order: 'asc',
    searching: false,
    query: '',
    matchingArchives: null,
    matchingArchivesQuery: null,
    // The status a search jumped to most recently, kept loaded in its
    // normal, unfiltered place in the timeline with its surrounding
    // context — see jumpToStatus and ArchiveFeed#around.
    activeMatchId: null,
    // Whether the *opposite* end from the one ScrollableList's own
    // onLoadMore paginates (see expandArchiveTimelineAround) still has
    // more to load — driven locally rather than through the timeline's
    // shared hasMore, which already tracks the other direction.
    hasMorePrev: false,
  };

  // Set right before navigating to another episode because the user picked
  // it from the "find next" prompt (or stepped via the prev/next arrows
  // mid-search), so the still-relevant search is resumed there — see
  // componentDidUpdate — instead of being reset like an ordinary episode
  // switch.
  jumpingToMatch = false;

  searchContainerRef = createRef();

  componentDidMount () {
    const { identity } = this.props;

    if (!identity.signedIn) {
      return;
    }

    api().get('/api/v1/archives').then(({ data }) => {
      this.setState({ archives: data });

      const { episodeId } = this.props.params;

      if (episodeId) {
        this.loadPage(episodeId, { order: this.state.order });
      } else if (data.length > 0) {
        this.props.history.replace(`/archive/${data[data.length - 1].id}`);
      }
    }).catch(() => this.setState({ archives: [] }));

    document.addEventListener('keydown', this.handleGlobalKeyDown);
  }

  componentDidUpdate (prevProps) {
    const { episodeId } = this.props.params;

    if (episodeId && episodeId !== prevProps.params.episodeId) {
      const wasJumpingToMatch = this.jumpingToMatch;
      this.jumpingToMatch = false;

      const query = this.state.query.trim();

      // preserveSearch is set unconditionally by the prev/next arrows (see
      // EpisodePicker), so this can land here with no search actually active
      // (query empty) or with one that simply has no match in this episode —
      // fall back to an ordinary load in both cases rather than leaving the
      // column showing nothing.
      if (wasJumpingToMatch && query.length >= 2) {
        this.setState({ hasMorePrev: false });
        this.findMatchInEpisode(episodeId, query).then(id => {
          if (id) {
            this.jumpToStatus(episodeId, id, this.state.order);
          } else {
            // No match in this episode after all — fall back to an ordinary
            // load, and drop the stale activeMatchId so a later order toggle
            // or "find next" doesn't re-center on/resume from a status that
            // belongs to a different episode.
            this.setState({ activeMatchId: null });
            this.loadPage(episodeId, { order: this.state.order });
          }
        });
      } else {
        this.setState({ searching: false, query: '', matchingArchives: null, matchingArchivesQuery: null, activeMatchId: null, hasMorePrev: false });
        this.loadPage(episodeId, { order: this.state.order });
      }
    }
  }

  componentWillUnmount () {
    this.fetchMatchingArchives.cancel();
    this.searchCurrentEpisode.cancel();
    this.cancelScroll();
    this.highlightObserver?.disconnect();
    if (this.highlightRaf) {
      cancelAnimationFrame(this.highlightRaf);
    }
    clearHighlight();
    clearTimeout(this.matchTargetTimeout);
    document.removeEventListener('keydown', this.handleGlobalKeyDown);
  }

  // Loads one page (the first, if cursor is omitted) in the given
  // direction — 'asc' walks forward from the start via min_id, 'desc'
  // walks backward from the newest via max_id, matching whichever
  // action a column showing that order should paginate with (see
  // ArchiveStatusListContainer's onLoadMore, which continues whichever of
  // these this started).
  loadPage = (episodeId, { order, cursor } = {}) => {
    const action = order === 'desc'
      ? expandArchiveTimeline(episodeId, { maxId: cursor })
      : expandArchiveTimelineFromStart(episodeId, { minId: cursor });

    this.props.dispatch(action);
  };

  // Discards whatever's currently loaded for this episode and starts over —
  // needed whenever the order changes, since that changes which page "the
  // first page" even is.
  reload = (episodeId, options = {}) => {
    this.props.dispatch(clearTimeline(`archive:${episodeId}`));
    this.loadPage(episodeId, options);
  };

  // Jumps the timeline to a window centered on `statusId` (e.g. a search
  // match), replacing whatever's currently loaded, and scrolls to + starts
  // highlighting it once it lands in the DOM. Kept unfiltered — the point
  // is to show the match *with* its surrounding, non-matching context,
  // like a browser's own find-in-page rather than a filtered result list.
  // `flash` controls the landed-here highlight below — on for an ordinary
  // jump (first search hit, landing on another episode), off for cycling
  // through this episode's matches one Enter press at a time, where
  // retriggering a ~1s flash on every match got in the way rather than
  // drawing the eye.
  jumpToStatus = (episodeId, statusId, order, { flash = true } = {}) => {
    this.cancelScroll();

    // expandArchiveTimelineAround clears the timeline itself, right before the
    // replacement page lands (see its comment) — clearing it here up front
    // instead would leave the list empty for the length of the request, which
    // flashed on every jump, including cycling through matches with Enter.
    this.props.dispatch(expandArchiveTimelineAround(episodeId, statusId, order)).then(hasMorePrev => {
      this.setState({ activeMatchId: statusId, hasMorePrev });
      this.scrollToActiveMatch(statusId, 0, flash);
      this.scheduleHighlight();
    });
  };

  // Looks up the next match for `query` within one episode (the earliest
  // one, if afterId is omitted) and jumps to it if found.
  searchAndJumpInEpisode = (episodeId, query, afterId) => {
    if (query.length < 2) {
      return;
    }

    this.findMatchInEpisode(episodeId, query, afterId).then(id => {
      if (id) {
        this.jumpToStatus(episodeId, id, this.state.order);
      }
    });
  };

  findMatchInEpisode = (episodeId, query, afterId) => {
    return api().get(`/api/v1/archives/${episodeId}/matches`, { params: { q: query, after_id: afterId } })
      .then(({ data }) => data.id)
      .catch(() => null);
  };

  cancelScroll () {
    if (this.scrollRaf) {
      cancelAnimationFrame(this.scrollRaf);
      this.scrollRaf = null;
    }
  }

  scrollToActiveMatch = (statusId, attempt = 0, flash = true) => {
    const container = this.column?.node;
    const target = container?.querySelector(`[data-id="${CSS.escape(statusId)}"]`);

    if (target) {
      target.scrollIntoView({ block: 'center' });

      if (flash) {
        // Reuses the same landed-here flash the thread view gives a newly
        // arrived reply (see Status#shouldHighlightOnMount) — applied
        // directly here instead, since jumping doesn't remount the status.
        target.classList.add('status--highlighted-entry');
        clearTimeout(this.matchTargetTimeout);
        this.matchTargetTimeout = setTimeout(() => target.classList.remove('status--highlighted-entry'), 2000);
      }

      return;
    }

    if (attempt < SCROLL_RETRY_FRAMES) {
      this.scrollRaf = requestAnimationFrame(() => this.scrollToActiveMatch(statusId, attempt + 1, flash));
    }
  };

  scheduleHighlight = () => {
    if (this.highlightRaf) {
      return;
    }

    this.highlightRaf = requestAnimationFrame(() => {
      this.highlightRaf = null;

      const query = this.state.query.trim();
      applyHighlight(this.column?.node, query.length >= 2 ? query : '');
    });
  };

  // Keeps highlighting in sync with content that loads in without this
  // component itself re-rendering — e.g. more pages arriving in the
  // connected status list below, which lives in Redux state this component
  // doesn't subscribe to.
  observeHighlightTarget (node) {
    if (!node || this.highlightObserver) {
      return;
    }

    this.highlightObserver = new MutationObserver(() => this.scheduleHighlight());
    this.highlightObserver.observe(node, { childList: true, subtree: true });
  }

  setRef = c => {
    this.column = c;
    this.observeHighlightTarget(c?.node);
  };

  handleHeaderClick = () => {
    this.column.scrollTop();
  };

  // preserveSearch (set by the prev/next arrows, not the episode dropdown —
  // see EpisodePicker) resumes an active search on the episode landed on,
  // the same way jumping via "find next" already does.
  handleSelectEpisode = (id, { preserveSearch = false } = {}) => {
    if (preserveSearch) {
      this.jumpingToMatch = true;
    }

    this.props.history.push(`/archive/${id}`);
  };

  handleToggleOrder = () => {
    const { episodeId } = this.props.params;
    const order = this.state.order === 'asc' ? 'desc' : 'asc';

    this.setState({ order, hasMorePrev: false });

    if (this.state.activeMatchId) {
      // Forward/backward flip meaning with the order, so re-center on the
      // same match to recompute them rather than leaving stale ones in
      // place — see expandArchiveTimelineAround.
      this.jumpToStatus(episodeId, this.state.activeMatchId, order);
    } else {
      this.reload(episodeId, { order });
    }
  };

  // Mirrors the browser's own find-in-page shortcut: bring focus to the
  // search box (scrolling it into view first) and select whatever text is
  // already there, ready to be typed over — including on repeat presses,
  // same as a real find bar, which never closes from the shortcut itself
  // (only Escape/Cancel does).
  handleGlobalKeyDown = e => {
    if ((e.key !== 'f' && e.key !== 'F') || !(e.metaKey || e.ctrlKey)) {
      return;
    }

    const input = this.searchContainerRef.current?.querySelector('input');

    if (!input) {
      return;
    }

    e.preventDefault();
    input.scrollIntoView({ block: 'nearest' });
    input.focus();
    input.select();
  };

  handleSearchActivate = () => {
    this.setState({ searching: true });
  };

  handleSearchBack = () => {
    this.fetchMatchingArchives.cancel();
    this.searchCurrentEpisode.cancel();

    this.setState({ searching: false, query: '', matchingArchives: null, matchingArchivesQuery: null }, this.scheduleHighlight);
  };

  handleSearchSubmit = query => {
    // ColumnSearchHeader calls onSubmit immediately followed by onEnter on
    // the form's actual submit — synchronously, in the same event, before
    // the setState below has actually landed — so handleSearchEnter reads
    // this instead of (necessarily stale) state to know the just-typed
    // value.
    this.currentQuery = query;
    this.setState({ query }, this.scheduleHighlight);

    if (query.trim().length >= 2) {
      this.searchCurrentEpisode(query.trim());
      this.fetchMatchingArchives(query.trim());
    } else {
      this.searchCurrentEpisode.cancel();
      this.fetchMatchingArchives.cancel();
      this.setState({ matchingArchives: null, matchingArchivesQuery: null });
    }
  };

  // Re-looks-up (and jumps to, if found) the earliest match in the current
  // episode — debounced so it doesn't fire on every keystroke.
  searchCurrentEpisode = debounce(query => {
    this.searchAndJumpInEpisode(this.props.params.episodeId, query);
  }, 300);

  // Which *other* episodes contain this query, so we can point the user at
  // one when the episode they're looking at doesn't have a match. Returns
  // the fetched list directly (in addition to storing it in state) so a
  // caller that needs to act on it right away — handleSearchEnter below —
  // doesn't have to guess whether the setState it triggered has landed yet.
  fetchMatchingArchivesNow = query => {
    return api().get('/api/v1/archives/search', { params: { q: query } }).then(({ data }) => {
      this.setState({ matchingArchives: data, matchingArchivesQuery: query });
      return data;
    }).catch(() => null);
  };

  fetchMatchingArchives = debounce(query => this.fetchMatchingArchivesNow(query), 300);

  jumpToMatchEpisode = matches => {
    const { episodeId } = this.props.params;
    const { archives } = this.state;

    if (!matches || matches.length === 0) {
      return;
    }

    const current = archives.find(archive => archive.id === episodeId);
    const next = matches.find(archive => compareId(archive.start_status_id, current.start_status_id) > 0) ?? matches[0];

    this.jumpingToMatch = true;
    this.props.history.push(`/archive/${next.id}`);
  };

  handleFindNext = () => {
    this.jumpToMatchEpisode(this.state.matchingArchives);
  };

  // Enter in the search box, mirroring a browser's own find-in-page bar:
  // jump to the next match — cycling through this episode's matches one at
  // a time before falling back to another episode (unlike the "find next"
  // hint/button, which only ever crosses episodes). If the per-keystroke
  // debounced lookup hasn't settled yet — e.g. Enter right after typing the
  // last character — this fetches immediately instead of acting on a
  // possibly-stale result.
  handleSearchEnter = () => {
    const query = (this.currentQuery ?? this.state.query).trim();

    if (query.length < 2) {
      return;
    }

    const { episodeId } = this.props.params;
    // An activeMatchId already set here means this Enter is continuing a
    // cycle through this episode's matches rather than landing on the first
    // one — skip the flash in that case (see jumpToStatus).
    const cycling = this.state.activeMatchId != null;

    this.searchCurrentEpisode.cancel();

    this.findMatchInEpisode(episodeId, query, this.state.activeMatchId).then(id => {
      if (id) {
        this.jumpToStatus(episodeId, id, this.state.order, { flash: !cycling });
      } else {
        this.fetchMatchingArchives.cancel();
        this.fetchMatchingArchivesNow(query).then(data => this.jumpToMatchEpisode(data));
      }
    });
  };

  handleLoadMorePrev = () => {
    const { episodeId } = this.props.params;
    const { order } = this.state;

    this.props.dispatch((dispatch, getState) => {
      const items = getState().getIn(['timelines', `archive:${episodeId}`, 'items'], ImmutableList());

      if (items.isEmpty()) {
        return;
      }

      const cursor = order === 'asc' ? items.last() : items.first();

      dispatch(expandArchiveTimelinePrev(episodeId, { cursor, order })).then(hasMorePrev => {
        this.setState({ hasMorePrev });
      });
    });
  };

  render () {
    const { columnId, multiColumn, intl, identity } = this.props;
    const { episodeId } = this.props.params;
    const { archives, order, searching, query, matchingArchives, matchingArchivesQuery, hasMorePrev } = this.state;
    const pinned = !!columnId;

    const trimmedQuery = query.trim();
    const matchesAreCurrent = trimmedQuery.length > 0 && matchingArchivesQuery === trimmedQuery && matchingArchives !== null;
    const currentEpisodeHasMatch = matchesAreCurrent && matchingArchives.some(archive => archive.id === episodeId);
    const otherEpisodesWithMatch = matchesAreCurrent ? matchingArchives.filter(archive => archive.id !== episodeId) : [];
    const showFindNext = matchesAreCurrent && !currentEpisodeHasMatch && otherEpisodesWithMatch.length > 0;
    const showNoMatches = matchesAreCurrent && matchingArchives.length === 0;

    if (!identity.signedIn) {
      return (
        <Column>
          <ColumnHeader
            icon='archive'
            iconComponent={InventoryIcon}
            title={intl.formatMessage({ id: 'archive_timeline.title', defaultMessage: 'Archive' })}
            multiColumn={multiColumn}
          />
          <div className='scrollable scrollable--flex'>
            <div className='empty-column-indicator'>
              <FormattedMessage id='archive_timeline.sign_in_required' defaultMessage='You need to be signed in to view this archive.' />
            </div>
          </div>
        </Column>
      );
    }

    if (archives === null) {
      return (
        <Column>
          <ColumnHeader
            icon='archive'
            iconComponent={InventoryIcon}
            title={intl.formatMessage({ id: 'archive_timeline.title', defaultMessage: 'Archive' })}
            multiColumn={multiColumn}
          />
        </Column>
      );
    }

    const current = archives.find(archive => archive.id === episodeId);
    const headerTitle = intl.formatMessage({ id: 'archive_timeline.title', defaultMessage: 'Archive' });
    const title = current ? current.title : headerTitle;

    return (
      <Column bindToDocument={!multiColumn} ref={this.setRef} label={title}>
        {/* Sticky as one unit so the picker/search/hint rows stay reachable
            while scrolling through a (potentially long) episode, rather than
            scrolling away with the posts — see .archive-timeline__header. */}
        <div className='archive-timeline__header'>
          <ColumnHeader
            icon='archive'
            iconComponent={InventoryIcon}
            title={headerTitle}
            onClick={this.handleHeaderClick}
            multiColumn={multiColumn}
          />

          {archives.length > 0 && (
            <EpisodePicker
              intl={intl}
              archives={archives}
              currentId={episodeId}
              order={order}
              onSelect={this.handleSelectEpisode}
              onToggleOrder={this.handleToggleOrder}
            />
          )}

          {archives.length > 0 && (
            <div className='archive-timeline__search' ref={this.searchContainerRef}>
              <ColumnSearchHeader
                active={searching}
                onActivate={this.handleSearchActivate}
                onBack={this.handleSearchBack}
                onSubmit={this.handleSearchSubmit}
                onEnter={this.handleSearchEnter}
                placeholder={intl.formatMessage({ id: 'archive_timeline.search_placeholder', defaultMessage: 'Search this archive' })}
                inputClassName='search__input'
              />
            </div>
          )}

          {showFindNext && (
            <div className='archive-timeline__find-next'>
              <span>
                <FormattedMessage
                  id='archive_timeline.find_next_hint'
                  defaultMessage='Not found here. Found in {count, plural, one {# other episode} other {# other episodes}}.'
                  values={{ count: otherEpisodesWithMatch.length }}
                />
              </span>
              <button type='button' className='link-button' onClick={this.handleFindNext}>
                <FormattedMessage id='archive_timeline.find_next' defaultMessage='Find next' />
              </button>
            </div>
          )}

          {showNoMatches && (
            <div className='archive-timeline__find-next'>
              <span>
                <FormattedMessage id='archive_timeline.no_matches' defaultMessage='No posts match your search.' />
              </span>
            </div>
          )}
        </div>

        {archives.length === 0 ? (
          <div className='scrollable scrollable--flex'>
            <div className='empty-column-indicator'>
              <FormattedMessage id='empty_column.archive_none' defaultMessage='No archives have been defined yet.' />
            </div>
          </div>
        ) : (
          <ArchiveStatusListContainer
            trackScroll={!pinned}
            scrollKey={`archive_timeline-${columnId}`}
            timelineId={`archive:${episodeId}`}
            episodeId={episodeId}
            order={order}
            hasMorePrev={hasMorePrev}
            onLoadMorePrev={this.handleLoadMorePrev}
            emptyMessage={
              <FormattedMessage id='empty_column.archive' defaultMessage='This episode has no posts.' />
            }
            bindToDocument={!multiColumn}
          />
        )}

        <Helmet>
          <title>{title}</title>
          <meta name='robots' content='noindex' />
        </Helmet>
      </Column>
    );
  }

}

export default withRouter(withIdentity(connect()(injectIntl(ArchiveTimeline))));
