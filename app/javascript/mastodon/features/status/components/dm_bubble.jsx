import PropTypes from 'prop-types';

import { defineMessages, useIntl } from 'react-intl';

import classNames from 'classnames';

import { useDispatch, useSelector } from 'react-redux';

import MoreHorizIcon from '@/material-icons/400-24px/more_horiz.svg?react';
import { deleteStatus } from 'mastodon/actions/statuses';
import { toggleFavourite } from 'mastodon/actions/interactions';
import { openModal } from 'mastodon/actions/modal';
import { initReport } from 'mastodon/actions/reports';
import AttachmentList from 'mastodon/components/attachment_list';
import { Avatar } from 'mastodon/components/avatar';
import { Dropdown } from 'mastodon/components/dropdown_menu';
import { AnimateEmojiProvider } from 'mastodon/components/emoji/context';
import { RelativeTimestamp } from 'mastodon/components/relative_timestamp';
import StatusContent from 'mastodon/components/status_content';
import { deleteModal, me } from 'mastodon/initial_state';
import { makeGetStatus } from 'mastodon/selectors';

const getStatus = makeGetStatus();

const messages = defineMessages({
  more: { id: 'status.more', defaultMessage: 'More' },
  copy: { id: 'status.copy', defaultMessage: 'Copy link to post' },
  favourite: { id: 'status.favourite', defaultMessage: 'Favorite' },
  removeFavourite: { id: 'status.remove_favourite', defaultMessage: 'Remove from favorites' },
  delete: { id: 'status.delete', defaultMessage: 'Delete' },
  report: { id: 'status.report', defaultMessage: 'Report @{name}' },
});

// A single direct message rendered as a chat bubble. Own messages align to the
// right, everyone else's to the left (Twitter/X-style conversation view).
// Per-message actions (delete, report, favourite, …) live behind an ellipsis
// menu instead of the always-visible action bar used for regular posts, since
// a full toolbar under every bubble reads as out of place in a chat view.
export const DmBubble = ({ id, focused }) => {
  const intl = useIntl();
  const dispatch = useDispatch();
  const status = useSelector(state => getStatus(state, { id }));

  if (!status) {
    return null;
  }

  const account = status.get('account');
  const own = account.get('id') === me;
  const mediaAttachments = status.get('media_attachments');

  const handleCopy = () => {
    navigator.clipboard.writeText(status.get('url'));
  };

  const handleFavouriteClick = () => {
    dispatch(toggleFavourite(status.get('id')));
  };

  const handleDeleteClick = () => {
    if (!deleteModal) {
      dispatch(deleteStatus(status.get('id'), false));
    } else {
      dispatch(openModal({
        modalType: 'CONFIRM_DELETE_STATUS',
        modalProps: { statusId: status.get('id') },
      }));
    }
  };

  const handleReportClick = () => {
    dispatch(initReport(account, status));
  };

  const menu = [
    { text: intl.formatMessage(messages.copy), action: handleCopy },
    { text: intl.formatMessage(status.get('favourited') ? messages.removeFavourite : messages.favourite), action: handleFavouriteClick },
    null,
    own
      ? { text: intl.formatMessage(messages.delete), action: handleDeleteClick, dangerous: true }
      : { text: intl.formatMessage(messages.report, { name: account.get('username') }), action: handleReportClick, dangerous: true },
  ];

  return (
    <AnimateEmojiProvider
      className={classNames('conversation-bubble', {
        'conversation-bubble--own': own,
        'conversation-bubble--focused': focused,
      })}
    >
      {!own && (
        <div className='conversation-bubble__avatar'>
          <Avatar account={account} size={36} withLink />
        </div>
      )}

      <div className='conversation-bubble__body'>
        <StatusContent
          status={status}
          expanded={!status.get('hidden')}
          collapsible
        />

        {mediaAttachments.size > 0 && (
          <AttachmentList compact media={mediaAttachments} />
        )}

        <span className='conversation-bubble__time'>
          <RelativeTimestamp timestamp={status.get('created_at')} />
        </span>
      </div>

      <div className='conversation-bubble__menu'>
        <Dropdown icon='ellipsis-h' iconComponent={MoreHorizIcon} status={status} items={menu} title={intl.formatMessage(messages.more)} />
      </div>
    </AnimateEmojiProvider>
  );
};

DmBubble.propTypes = {
  id: PropTypes.string.isRequired,
  focused: PropTypes.bool,
};
