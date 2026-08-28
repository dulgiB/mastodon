import PropTypes from 'prop-types';
import { PureComponent } from 'react';

import { FormattedMessage } from 'react-intl';

import { Helmet } from '@unhead/react/helmet';
import { withRouter } from 'react-router-dom';

import { connect } from 'react-redux';

import InventoryIcon from '@/material-icons/400-24px/inventory_2.svg?react';
import { injectIntl } from '@/mastodon/components/intl';
import { loadEntireArchiveTimeline } from 'mastodon/actions/timelines';
import api from 'mastodon/api';
import Column from 'mastodon/components/column';
import ColumnHeader from 'mastodon/components/column_header';
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
  };

  componentDidMount () {
    const { identity } = this.props;

    if (!identity.signedIn) {
      return;
    }

    api().get('/api/v1/archives').then(({ data }) => {
      this.setState({ archives: data });

      const { episodeId } = this.props.params;

      if (episodeId) {
        this.props.dispatch(loadEntireArchiveTimeline(episodeId));
      } else if (data.length > 0) {
        this.props.history.replace(`/archive/${data[data.length - 1].id}`);
      }
    }).catch(() => this.setState({ archives: [] }));
  }

  componentDidUpdate (prevProps) {
    const { episodeId } = this.props.params;

    if (episodeId && episodeId !== prevProps.params.episodeId) {
      this.props.dispatch(loadEntireArchiveTimeline(episodeId));
    }
  }

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

  render () {
    const { columnId, multiColumn, intl, identity } = this.props;
    const { episodeId } = this.props.params;
    const { archives, order } = this.state;
    const pinned = !!columnId;

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
    const title = current ? current.title : intl.formatMessage({ id: 'archive_timeline.title', defaultMessage: 'Archive' });

    return (
      <Column bindToDocument={!multiColumn} ref={this.setRef} label={title}>
        <ColumnHeader
          icon='archive'
          iconComponent={InventoryIcon}
          title={title}
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

        <ArchiveStatusListContainer
          trackScroll={!pinned}
          scrollKey={`archive_timeline-${columnId}`}
          timelineId={`archive:${episodeId}`}
          order={order}
          emptyMessage={
            archives.length === 0 ? (
              <FormattedMessage id='empty_column.archive_none' defaultMessage='No archives have been defined yet.' />
            ) : (
              <FormattedMessage id='empty_column.archive' defaultMessage='This episode has no posts.' />
            )
          }
          bindToDocument={!multiColumn}
        />

        <Helmet>
          <title>{title}</title>
          <meta name='robots' content='noindex' />
        </Helmet>
      </Column>
    );
  }

}

export default withRouter(withIdentity(connect()(injectIntl(ArchiveTimeline))));
