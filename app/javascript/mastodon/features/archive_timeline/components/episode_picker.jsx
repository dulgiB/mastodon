import PropTypes from 'prop-types';

import { FormattedMessage } from 'react-intl';

import ArrowDownwardIcon from '@/material-icons/400-24px/arrow_downward.svg?react';
import ArrowUpwardIcon from '@/material-icons/400-24px/arrow_upward.svg?react';
import ChevronLeftIcon from '@/material-icons/400-24px/chevron_left.svg?react';
import ChevronRightIcon from '@/material-icons/400-24px/chevron_right.svg?react';
import { Icon } from 'mastodon/components/icon';
import { IconButton } from 'mastodon/components/icon_button';

export const EpisodePicker = ({ intl, archives, currentId, order, onSelect, onToggleOrder }) => {
  const index = archives.findIndex(archive => archive.id === currentId);
  const previous = index > 0 ? archives[index - 1] : null;
  const next = index >= 0 && index < archives.length - 1 ? archives[index + 1] : null;

  return (
    <div className='archive-timeline__picker'>
      <IconButton
        className='archive-timeline__picker__arrow'
        title={intl.formatMessage({ id: 'archive_timeline.previous_episode', defaultMessage: 'Previous episode' })}
        icon='chevron-left'
        iconComponent={ChevronLeftIcon}
        disabled={!previous}
        onClick={() => previous && onSelect(previous.id)}
      />

      <select
        className='archive-timeline__picker__select'
        value={currentId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        aria-label={intl.formatMessage({ id: 'archive_timeline.episode', defaultMessage: 'Episode' })}
      >
        {archives.map(archive => (
          <option key={archive.id} value={archive.id}>{archive.title}</option>
        ))}
      </select>

      <IconButton
        className='archive-timeline__picker__arrow'
        title={intl.formatMessage({ id: 'archive_timeline.next_episode', defaultMessage: 'Next episode' })}
        icon='chevron-right'
        iconComponent={ChevronRightIcon}
        disabled={!next}
        onClick={() => next && onSelect(next.id)}
      />

      <button type='button' className='archive-timeline__picker__order' onClick={onToggleOrder}>
        <Icon id={order === 'asc' ? 'arrow-up' : 'arrow-down'} icon={order === 'asc' ? ArrowUpwardIcon : ArrowDownwardIcon} />
        {' '}
        {order === 'asc' ? (
          <FormattedMessage id='archive_timeline.oldest_first' defaultMessage='Oldest first' />
        ) : (
          <FormattedMessage id='archive_timeline.newest_first' defaultMessage='Newest first' />
        )}
      </button>
    </div>
  );
};

EpisodePicker.propTypes = {
  intl: PropTypes.object.isRequired,
  archives: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
  })).isRequired,
  currentId: PropTypes.string,
  order: PropTypes.oneOf(['asc', 'desc']).isRequired,
  onSelect: PropTypes.func.isRequired,
  onToggleOrder: PropTypes.func.isRequired,
};

export default EpisodePicker;
