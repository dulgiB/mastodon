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

// Groups show as a row of toggle chips above the dropdown, and the dropdown
// lists only the episodes of the selected groups, in time order, so a long
// run of episodes doesn't turn into one endless list. Any number of groups
// can be selected at once; with none selected (the default) every episode is
// listed. The open episode is always among the listed ones: deselecting its
// group (or selecting groups that leave it out) switches to the most recent
// episode still listed.
//
// The prev/next arrows pass preserveSearch: true (an active search follows
// you when stepping to an adjacent episode, same as it does jumping via
// "find next"), but the dropdown doesn't — picking a specific episode by
// name is a deliberate jump elsewhere, not a continuation of the search.
// The arrows walk the same episodes the dropdown lists.
export const EpisodePicker = ({ intl, archives, currentId, order, onSelect, onToggleOrder }) => {
  const groups = useMemo(() => groupArchives(archives), [archives]);
  const current = archives.find(archive => archive.id === currentId);
  const currentGroupKey = current ? groupKeyOf(current) : null;
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());

  // While some groups are selected, make sure the open episode's group is
  // listed whenever the open episode changes, e.g. on landing on a search hit
  // elsewhere. With none selected everything is listed already.
  useEffect(() => {
    if (currentGroupKey) {
      setSelectedKeys(keys => keys.size === 0 || keys.has(currentGroupKey) ? keys : new Set([...keys, currentGroupKey]));
    }
  }, [currentGroupKey]);

  const toggleGroup = key => {
    const nextKeys = new Set(selectedKeys);

    if (nextKeys.has(key)) {
      nextKeys.delete(key);
    } else {
      nextKeys.add(key);
    }

    setSelectedKeys(nextKeys);

    if (nextKeys.size > 0 && currentGroupKey && !nextKeys.has(currentGroupKey)) {
      const latest = archives.findLast(archive => nextKeys.has(groupKeyOf(archive)));

      if (latest) {
        onSelect(latest.id);
      }
    }
  };

  const isListed = archive => selectedKeys.size === 0 || selectedKeys.has(groupKeyOf(archive));
  const options = archives.filter(isListed);
  const currentInOptions = options.some(archive => archive.id === currentId);

  const index = archives.findIndex(archive => archive.id === currentId);

  // Wrap around at either end, matching how the search box's own
  // prev/next-match arrows loop past the last match (see
  // ArchiveTimeline#jumpToAdjacentMatch) — stopping dead here while those
  // looped read as inconsistent. With nothing else listed there's nowhere to
  // go, so the arrow stays disabled rather than re-selecting the open one.
  const step = direction => {
    if (index < 0) {
      return null;
    }

    for (let offset = 1; offset <= archives.length; offset++) {
      const archive = archives[(index + direction * offset + archives.length * offset) % archives.length];

      if (archive.id !== currentId && isListed(archive)) {
        return archive;
      }
    }

    return null;
  };

  const previous = step(-1);
  const next = step(1);

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
            aria-pressed={selectedKeys.has(group.id)}
            onClick={() => toggleGroup(group.id)}
          >
            {group.title ?? intl.formatMessage({ id: 'archive_timeline.ungrouped', defaultMessage: 'Other' })}
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
