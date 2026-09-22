import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';
import type { RefCallback, FC } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import classNames from 'classnames';
import { useHistory } from 'react-router-dom';

import type { List as ImmutableList } from 'immutable';

import { animated, useSpring } from '@react-spring/web';
import { useDrag } from '@use-gesture/react';

import type { MediaAttachment } from '@/mastodon/models/status';
import ChevronLeftIcon from '@/material-icons/400-24px/chevron_left.svg?react';
import ChevronRightIcon from '@/material-icons/400-24px/chevron_right.svg?react';
import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import MoreHorizIcon from '@/material-icons/400-24px/more_horiz.svg?react';
import type { RGB } from 'mastodon/blurhash';
import { getAverageFromBlurhash } from 'mastodon/blurhash';
import { Dropdown } from 'mastodon/components/dropdown_menu';
import { GIFV } from 'mastodon/components/gifv';
import { Icon } from 'mastodon/components/icon';
import { IconButton } from 'mastodon/components/icon_button';
import { Footer } from 'mastodon/features/picture_in_picture/components/footer';
import { Video } from 'mastodon/features/video';
import type { MenuItem } from 'mastodon/models/dropdown_menu';
import { useAppSelector } from 'mastodon/store';

import { MediaModalStatus } from './media_modal_status';
import { ZoomableImage } from './zoomable_image';

const messages = defineMessages({
  close: { id: 'lightbox.close', defaultMessage: 'Close' },
  previous: { id: 'lightbox.previous', defaultMessage: 'Previous' },
  next: { id: 'lightbox.next', defaultMessage: 'Next' },
  collapsePost: { id: 'lightbox.collapse_post', defaultMessage: 'Hide post' },
  expandPost: { id: 'lightbox.expand_post', defaultMessage: 'Show post' },
  more: { id: 'status.more', defaultMessage: 'More' },
  viewPost: { id: 'lightbox.view_post', defaultMessage: 'View post' },
});

interface MediaModalProps {
  media: ImmutableList<MediaAttachment>;
  statusId?: string;
  // Set by the openers that leave the post out of view, i.e. a gallery.
  withSourceStatus?: boolean;
  lang?: string;
  index: number;
  onClose: () => void;
  onChangeBackgroundColor: (color: RGB | null) => void;
  currentTime?: number;
  autoPlay?: boolean;
  volume?: number;
}

const MIN_SWIPE_DISTANCE = 400;
const isLtrDir = getComputedStyle(document.body).direction !== 'rtl';

export const MediaModal = forwardRef<HTMLDivElement, MediaModalProps>(
  (
    {
      media,
      onClose,
      index: startIndex,
      lang,
      currentTime,
      autoPlay,
      volume,
      statusId,
      withSourceStatus,
      onChangeBackgroundColor,
    },
    _ref,
  ) => {
    const [index, setIndex] = useState(startIndex);
    const [zoomedIn, setZoomedIn] = useState(false);
    const [statusCollapsed, setStatusCollapsed] = useState(false);
    const currentMedia = media.get(index);

    const sign = isLtrDir ? '-' : '';

    const [wrapperStyles, api] = useSpring(() => ({
      x: `${sign}${index * 100}%`,
    }));

    const handleChangeIndex = useCallback(
      (newIndex: number, animate = false) => {
        if (newIndex < 0) {
          newIndex = media.size + newIndex;
        } else if (newIndex >= media.size) {
          newIndex = newIndex % media.size;
        }
        setIndex(newIndex);
        setZoomedIn(false);
        if (animate) {
          void api.start({
            x: `calc(${sign}${newIndex * 100}% + 0px)`,
          });
        }
      },
      [api, media.size, sign],
    );
    const handlePrevClick = useCallback(() => {
      handleChangeIndex(index - 1, true);
    }, [handleChangeIndex, index]);
    const handleNextClick = useCallback(() => {
      handleChangeIndex(index + 1, true);
    }, [handleChangeIndex, index]);

    const handleKeyDown = useCallback(
      (event: KeyboardEvent) => {
        const prevKey = isLtrDir ? 'ArrowLeft' : 'ArrowRight';
        const nextKey = isLtrDir ? 'ArrowRight' : 'ArrowLeft';

        if (event.key === prevKey) {
          handlePrevClick();
          event.preventDefault();
          event.stopPropagation();
        } else if (event.key === nextKey) {
          handleNextClick();
          event.preventDefault();
          event.stopPropagation();
        }
      },
      [handleNextClick, handlePrevClick],
    );

    const bind = useDrag(
      ({ active, movement: [mx], direction: [xDir], cancel, event }) => {
        // Disable swipe when zoomed in.
        if (zoomedIn) {
          return;
        }

        // The panel scrolls; a drag that starts there is not a swipe.
        if (
          event.target instanceof Element &&
          event.target.closest('.media-modal__status')
        ) {
          return;
        }

        // If dragging and swipe distance is enough, change the index.
        if (
          active &&
          Math.abs(mx) > Math.min(window.innerWidth / 4, MIN_SWIPE_DISTANCE)
        ) {
          handleChangeIndex(isLtrDir ? index - xDir : index + xDir);
          cancel();
        }
        // Set the x position via calc to ensure proper centering regardless of screen size.
        const x = active ? mx : 0;
        const operator = isLtrDir ? '+' : '-';
        void api.start({
          x: `calc(${sign}${index * 100}% ${operator} ${x}px)`,
        });
      },
      { pointer: { capture: false } },
    );

    useEffect(() => {
      window.addEventListener('keydown', handleKeyDown, false);

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }, [handleKeyDown]);

    useEffect(() => {
      const blurhash = currentMedia?.get('blurhash') as string | undefined;
      if (blurhash) {
        const backgroundColor = getAverageFromBlurhash(blurhash);
        if (backgroundColor) {
          onChangeBackgroundColor(backgroundColor);
        }
      }
      return () => {
        onChangeBackgroundColor(null);
      };
    }, [currentMedia, onChangeBackgroundColor]);

    const handleRef: RefCallback<HTMLDivElement> = useCallback(
      (ele) => {
        if (typeof _ref === 'function') {
          _ref(ele);
        } else if (_ref) {
          _ref.current = ele;
        }
      },
      [_ref],
    );

    const handleZoomClick = useCallback(() => {
      setZoomedIn((prev) => !prev);
    }, []);

    const [navigationHidden, setNavigationHidden] = useState(false);
    const handleToggleNavigation = useCallback(() => {
      setNavigationHidden((prev) => !prev);
    }, []);

    const content = useMemo(
      () =>
        media.map((item, idx) => {
          const url = item.get('url') as string;
          const blurhash = item.get('blurhash') as string;
          const width = item.getIn(['meta', 'original', 'width'], 0) as number;
          const height = item.getIn(
            ['meta', 'original', 'height'],
            0,
          ) as number;
          const description = item.getIn(
            ['translation', 'description'],
            item.get('description'),
          ) as string;
          if (item.get('type') === 'image') {
            return (
              <ZoomableImage
                src={url}
                blurhash={blurhash}
                width={width}
                height={height}
                alt={description}
                lang={lang}
                key={url}
                onClick={handleToggleNavigation}
                onDoubleClick={handleZoomClick}
                onClose={onClose}
                onZoomChange={setZoomedIn}
                zoomedIn={zoomedIn && idx === index}
              />
            );
          } else if (item.get('type') === 'video') {
            return (
              <Video
                preview={item.get('preview_url') as string | undefined}
                blurhash={blurhash}
                src={url}
                frameRate={
                  item.getIn(['meta', 'original', 'frame_rate']) as
                    | string
                    | undefined
                }
                aspectRatio={`${width} / ${height}`}
                startTime={currentTime ?? 0}
                startPlaying={autoPlay ?? false}
                startVolume={volume ?? 1}
                onCloseVideo={onClose}
                detailed
                alt={description}
                lang={lang}
                key={url}
              />
            );
          } else if (item.get('type') === 'gifv') {
            return (
              <GIFV
                src={url}
                key={url}
                alt={description}
                lang={lang}
                onClick={handleToggleNavigation}
              />
            );
          }

          return null;
        }),
      [
        autoPlay,
        currentTime,
        handleToggleNavigation,
        handleZoomClick,
        index,
        lang,
        media,
        onClose,
        volume,
        zoomedIn,
      ],
    );

    const intl = useIntl();

    const sourceStatusId = withSourceStatus ? statusId : undefined;

    const handleToggleStatus = useCallback(() => {
      setStatusCollapsed((value) => !value);
    }, []);

    const history = useHistory();
    const sourceAcct = useAppSelector((state) => {
      if (!sourceStatusId) {
        return undefined;
      }

      const accountId = state.statuses.getIn([sourceStatusId, 'account']) as
        | string
        | undefined;

      return accountId ? state.accounts.get(accountId)?.acct : undefined;
    });

    const statusMenu: MenuItem[] = useMemo(
      () => [
        {
          text: intl.formatMessage(messages.viewPost),
          action: () => {
            onClose();

            if (sourceAcct && sourceStatusId) {
              history.push(`/@${sourceAcct}/${sourceStatusId}`);
            }
          },
        },
      ],
      [intl, history, onClose, sourceAcct, sourceStatusId],
    );

    const prevNav = media.size > 1 && (
      <button
        className='media-modal__nav media-modal__nav--prev'
        onClick={handlePrevClick}
        aria-label={intl.formatMessage(messages.previous)}
        type='button'
      >
        <Icon id='chevron-left' icon={ChevronLeftIcon} />
      </button>
    );
    const nextNav = media.size > 1 && (
      <button
        className='media-modal__nav  media-modal__nav--next'
        onClick={handleNextClick}
        aria-label={intl.formatMessage(messages.next)}
        type='button'
      >
        <Icon id='chevron-right' icon={ChevronRightIcon} />
      </button>
    );

    return (
      <div
        {...bind()}
        className={classNames('modal-root__modal media-modal', {
          'media-modal--with-source-status': !!sourceStatusId,
          'media-modal--source-status-collapsed': statusCollapsed,
        })}
        ref={handleRef}
      >
        <animated.div
          style={wrapperStyles}
          className='media-modal__closer'
          role='presentation'
          onClick={onClose}
        >
          {content}
        </animated.div>

        <div
          className={classNames('media-modal__navigation', {
            'media-modal__navigation--hidden': navigationHidden,
          })}
        >
          <div className='media-modal__close'>
            <IconButton
              title={intl.formatMessage(messages.close)}
              icon='times'
              iconComponent={CloseIcon}
              onClick={onClose}
            />
          </div>

          <div className='media-modal__buttons'>
            {sourceStatusId && (
              <>
                <IconButton
                  className='media-modal__status-toggle'
                  title={intl.formatMessage(
                    statusCollapsed
                      ? messages.expandPost
                      : messages.collapsePost,
                  )}
                  icon=''
                  iconComponent={
                    statusCollapsed ? ChevronLeftIcon : ChevronRightIcon
                  }
                  onClick={handleToggleStatus}
                />

                <Dropdown
                  iconClassName='media-modal__status-menu'
                  items={statusMenu}
                  icon='ellipsis-h'
                  iconComponent={MoreHorizIcon}
                  title={intl.formatMessage(messages.more)}
                  placement='bottom-end'
                />
              </>
            )}
          </div>

          {prevNav}
          {nextNav}

          <div className='media-modal__overlay'>
            <MediaPagination
              itemsCount={media.size}
              index={index}
              onChangeIndex={handleChangeIndex}
            />
            {statusId && (
              <Footer statusId={statusId} withOpenButton onClose={onClose} />
            )}
          </div>
        </div>

        {sourceStatusId && (
          <MediaModalStatus statusId={sourceStatusId} onClose={onClose} />
        )}
      </div>
    );
  },
);
MediaModal.displayName = 'MediaModal';

interface MediaPaginationProps {
  itemsCount: number;
  index: number;
  onChangeIndex: (newIndex: number) => void;
}

const MediaPagination: FC<MediaPaginationProps> = ({
  itemsCount,
  index,
  onChangeIndex,
}) => {
  const handleChangeIndex = useCallback(
    (curIndex: number) => {
      return () => {
        onChangeIndex(curIndex);
      };
    },
    [onChangeIndex],
  );

  if (itemsCount <= 1) {
    return null;
  }

  return (
    <ul className='media-modal__pagination'>
      {Array.from({ length: itemsCount }).map((_, i) => (
        <button
          key={i}
          className={classNames('media-modal__page-dot', {
            active: i === index,
          })}
          onClick={handleChangeIndex(i)}
          type='button'
        >
          {i + 1}
        </button>
      ))}
    </ul>
  );
};
