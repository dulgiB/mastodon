import PropTypes from 'prop-types';
import { createRef, PureComponent } from 'react';

import { FormattedMessage } from 'react-intl';

import { Helmet } from '@unhead/react/helmet';
import { withRouter } from 'react-router-dom';

import { connect } from 'react-redux';

import { debounce } from 'lodash';

import InventoryIcon from '@/material-icons/400-24px/inventory_2.svg?react';
import { injectIntl } from '@/mastodon/components/intl';
import { loadEntireArchiveTimeline } from 'mastodon/actions/timelines';
import api from 'mastodon/api';
import { compareId } from 'mastodon/compare_id';
import Column from 'mastodon/components/column';
import ColumnHeader from 'mastodon/components/column_header';
import { ColumnSearchHeader } from 'mastodon/components/column_search_header';
import { LoadingIndicator } from 'mastodon/components/loading_indicator';
import { identityContextPropShape, withIdentity } from 'mastodon/identity_context';
import { WithRouterPropTypes } from 'mastodon/utils/react_router';

import EpisodePicker from './components/episode_picker';
import ArchiveStatusListContainer from './containers/status_list_container';

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
    // The whole episode is loaded backwards (newest page first, per the
    // ordinary max_id pagination `expandArchiveTimeline` uses) regardless of
    // the display `order`. Rendering the list as pages trickle in therefore
    // means the default oldest-first view grows from the bottom while
    // reversing on every page, which reads as the scroll position jumping
    // around. Keep the list hidden behind a spinner until the whole episode
    // (loadEntireArchiveTimeline's returned promise) has resolved, matching
    // this feature's own premise: it loads the bounded episode fully before
    // letting the UI reorder/scroll it, rather than incrementally.
    loadingEpisode: true,
  };

  // Set right before navigating to another episode because the user picked
  // it from the "find next" prompt, so the still-relevant search stays
  // active there instead of being reset like an ordinary episode switch.
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
        this.loadEpisode(episodeId);
      } else if (data.length > 0) {
        this.props.history.replace(`/archive/${data[data.length - 1].id}`);
      } else {
        this.setState({ loadingEpisode: false });
      }
    }).catch(() => this.setState({ archives: [], loadingEpisode: false }));

    document.addEventListener('keydown', this.handleGlobalKeyDown);
  }

  componentDidUpdate (prevProps) {
    const { episodeId } = this.props.params;

    if (episodeId && episodeId !== prevProps.params.episodeId) {
      this.loadEpisode(episodeId);

      if (this.jumpingToMatch) {
        this.jumpingToMatch = false;
      } else {
        this.setState({ searching: false, query: '', matchingArchives: null, matchingArchivesQuery: null });
      }
    }
  }

  componentWillUnmount () {
    this.fetchMatchingArchives.cancel();
    document.removeEventListener('keydown', this.handleGlobalKeyDown);
  }

  loadEpisode = episodeId => {
    this.setState({ loadingEpisode: true });
    this.props.dispatch(loadEntireArchiveTimeline(episodeId)).then(() => {
      this.setState({ loadingEpisode: false });
    });
  };

  setRef = c => {
    this.column = c;
  };

  handleHeaderClick = () => {
    this.column.scrollTop();
  };

  handleSelectEpisode = id => {
    this.props.history.push(`/archive/${id}`);
  };

  handleToggleOrder = () => {
    this.setState(state => ({ order: state.order === 'asc' ? 'desc' : 'asc' }));
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
    this.setState({ searching: false, query: '', matchingArchives: null, matchingArchivesQuery: null });
  };

  handleSearchSubmit = query => {
    this.setState({ query });

    if (query.trim().length >= 2) {
      this.fetchMatchingArchives(query);
    } else {
      this.fetchMatchingArchives.cancel();
      this.setState({ matchingArchives: null, matchingArchivesQuery: null });
    }
  };

  // Which *other* episodes contain this query, so we can point the user at
  // one when the episode they're looking at doesn't have a match.
  fetchMatchingArchives = debounce(query => {
    api().get('/api/v1/archives/search', { params: { q: query } }).then(({ data }) => {
      this.setState({ matchingArchives: data, matchingArchivesQuery: query });
    }).catch(() => {});
  }, 300);

  handleFindNext = () => {
    const { matchingArchives } = this.state;
    const { episodeId } = this.props.params;
    const { archives } = this.state;

    if (!matchingArchives || matchingArchives.length === 0) {
      return;
    }

    const current = archives.find(archive => archive.id === episodeId);
    const next = matchingArchives.find(archive => compareId(archive.start_status_id, current.start_status_id) > 0) ?? matchingArchives[0];

    this.jumpingToMatch = true;
    this.props.history.push(`/archive/${next.id}`);
  };

  render () {
    const { columnId, multiColumn, intl, identity } = this.props;
    const { episodeId } = this.props.params;
    const { archives, order, searching, query, matchingArchives, matchingArchivesQuery, loadingEpisode } = this.state;
    const pinned = !!columnId;

    const trimmedQuery = query.trim();
    const matchesAreCurrent = trimmedQuery.length > 0 && matchingArchivesQuery === query && matchingArchives !== null;
    const currentEpisodeHasMatch = matchesAreCurrent && matchingArchives.some(archive => archive.id === episodeId);
    const otherEpisodesWithMatch = matchesAreCurrent ? matchingArchives.filter(archive => archive.id !== episodeId) : [];
    const showFindNext = matchesAreCurrent && !currentEpisodeHasMatch && otherEpisodesWithMatch.length > 0;

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

        {archives.length === 0 ? (
          <div className='scrollable scrollable--flex'>
            <div className='empty-column-indicator'>
              <FormattedMessage id='empty_column.archive_none' defaultMessage='No archives have been defined yet.' />
            </div>
          </div>
        ) : loadingEpisode ? (
          <div className='scrollable scrollable--flex'>
            <LoadingIndicator />
          </div>
        ) : (
          <ArchiveStatusListContainer
            trackScroll={!pinned}
            scrollKey={`archive_timeline-${columnId}`}
            timelineId={`archive:${episodeId}`}
            order={order}
            query={query}
            emptyMessage={
              query.trim() ? (
                <FormattedMessage id='empty_column.archive_search' defaultMessage='No posts in this episode match your search.' />
              ) : (
                <FormattedMessage id='empty_column.archive' defaultMessage='This episode has no posts.' />
              )
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
