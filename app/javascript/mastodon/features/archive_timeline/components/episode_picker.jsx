import PropTypes from 'prop-types';
import { useEffect, useMemo, useState } from 'react';

import { FormattedMessage } from 'react-intl';

import ArrowDownwardIcon from '@/material-icons/400-24px/arrow_downward.svg?react';
import ArrowUpwardIcon from '@/material-icons/400-24px/arrow_upward.svg?react';
import ChevronLeftIcon from '@/material-icons/400-24px/chevron_left.svg?react';
import ChevronRightIcon from '@/material-icons/400-24px/chevron_right.svg?react';
import { Icon } from 'mastodon/components/icon';
import { IconButton } from 'mastodon/components/icon_button';

const UNGROUPED = 'ungrouped';

const groupKeyOf = archive => archive.group?.id ?? UNGROUPED;

// Buckets the (chronologically ordered) archives by group, groups ordered by
// their admin-set position; episodes with no group trail at the end. Episode
// order within a group stays chronological. Returns [] when nothing is
// grouped at all, so the picker falls back to a single flat dropdown.
const groupArchives = archives => {
  if (!archives.some(archive => archive.group)) {
    return [];
  }

  const groups = new Map();

  archives.forEach(archive => {
    const key = groupKeyOf(archive);

    if (!groups.has(key)) {
      groups.set(key, { id: key, title: archive.group?.title ?? null, position: archive.group?.position ?? Infinity, archives: [] });
    }

    groups.get(key).archives.push(archive);
  });

  return [...groups.values()].sort((a, b) => a.position - b.position);
};

// Groups show as a chip row above the dropdown, and the dropdown lists only
// the chosen group's episodes, so a long run of episodes doesn't turn into one
// endless list. Choosing a chip only browses: the open episode stays open
// until one is picked from that group's dropdown.
//
// The prev/next arrows pass preserveSearch: true (an active search follows
// you when stepping to an adjacent episode, same as it does jumping via
// "find next"), but the dropdown doesn't — picking a specific episode by
// name is a deliberate jump elsewhere, not a continuation of the search.
// The arrows still walk every episode in time order, crossing groups, since
// interludes sit between the main episodes chronologically.
export const EpisodePicker = ({ intl, archives, currentId, order, onSelect, onToggleOrder }) => {
  const groups = useMemo(() => groupArchives(archives), [archives]);
  const current = archives.find(archive => archive.id === currentId);
  const currentGroupKey = current ? groupKeyOf(current) : groups[0]?.id;
  const [browsingGroupKey, setBrowsingGroupKey] = useState(currentGroupKey);

  // Follow the open episode, e.g. after the arrows step into another group.
  useEffect(() => {
    setBrowsingGroupKey(currentGroupKey);
  }, [currentGroupKey]);

  const browsingGroup = groups.find(group => group.id === browsingGroupKey) ?? groups.find(group => group.id === currentGroupKey);
  const options = browsingGroup ? browsingGroup.archives : archives;
  const currentInOptions = options.some(archive => archive.id === currentId);

  const index = archives.findIndex(archive => archive.id === currentId);
  // Wrap around at either end, matching how the search box's own
  // prev/next-match arrows loop past the last match (see
  // ArchiveTimeline#jumpToAdjacentMatch) — stopping dead here while those
  // looped read as inconsistent. With a single episode there's nowhere to
  // go, so both stay disabled rather than re-selecting the open one.
  const canStep = index >= 0 && archives.length > 1;
  const previous = canStep ? archives[(index - 1 + archives.length) % archives.length] : null;
  const next = canStep ? archives[(index + 1) % archives.length] : null;

  const picker = (
    <div className='archive-timeline__picker'>
      <IconButton
        className='archive-timeline__picker__arrow'
        title={intl.formatMessage({ id: 'archive_timeline.previous_episode', defaultMessage: 'Previous episode' })}
        icon='chevron-left'
        iconComponent={ChevronLeftIcon}
        disabled={!previous}
        onClick={() => previous && onSelect(previous.id, { preserveSearch: true })}
      />

      <select
        className='archive-timeline__picker__select'
        value={currentInOptions ? currentId : ''}
        onChange={(e) => onSelect(e.target.value)}
        aria-label={intl.formatMessage({ id: 'archive_timeline.episode', defaultMessage: 'Episode' })}
      >
        {!currentInOptions && (
          <option value='' disabled>
            {intl.formatMessage({ id: 'archive_timeline.choose_episode', defaultMessage: 'Choose an episode' })}
          </option>
        )}
        {options.map(archive => (
          <option key={archive.id} value={archive.id}>{archive.title}</option>
        ))}
      </select>

      <IconButton
        className='archive-timeline__picker__arrow'
        title={intl.formatMessage({ id: 'archive_timeline.next_episode', defaultMessage: 'Next episode' })}
        icon='chevron-right'
        iconComponent={ChevronRightIcon}
        disabled={!next}
        onClick={() => next && onSelect(next.id, { preserveSearch: true })}
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

  if (groups.length === 0) {
    return picker;
  }

  return (
    <>
      <div
        className='archive-timeline__groups'
        role='group'
        aria-label={intl.formatMessage({ id: 'archive_timeline.episode_group', defaultMessage: 'Episode group' })}
      >
        {groups.map(group => (
          <button
            key={group.id}
            type='button'
            className='archive-timeline__groups__chip'
            aria-pressed={group.id === browsingGroup?.id}
            onClick={() => setBrowsingGroupKey(group.id)}
          >
            {group.title ?? intl.formatMessage({ id: 'archive_timeline.ungrouped', defaultMessage: 'Other' })}
            {group.id === currentGroupKey && group.id !== browsingGroup?.id && (
              <span className='archive-timeline__groups__chip__current' aria-hidden />
            )}
          </button>
        ))}
      </div>

      {picker}
    </>
  );
};

EpisodePicker.propTypes = {
  intl: PropTypes.object.isRequired,
  archives: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    group: PropTypes.shape({
      id: PropTypes.string.isRequired,
      title: PropTypes.string.isRequired,
      position: PropTypes.number.isRequired,
    }),
  })).isRequired,
  currentId: PropTypes.string,
  order: PropTypes.oneOf(['asc', 'desc']).isRequired,
  onSelect: PropTypes.func.isRequired,
  onToggleOrder: PropTypes.func.isRequired,
};

export default EpisodePicker;
