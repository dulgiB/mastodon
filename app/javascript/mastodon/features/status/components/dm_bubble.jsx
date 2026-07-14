import PropTypes from 'prop-types';

import classNames from 'classnames';

import { useSelector } from 'react-redux';

import AttachmentList from 'mastodon/components/attachment_list';
import { Avatar } from 'mastodon/components/avatar';
import { AnimateEmojiProvider } from 'mastodon/components/emoji/context';
import { RelativeTimestamp } from 'mastodon/components/relative_timestamp';
import StatusContent from 'mastodon/components/status_content';
import { me } from 'mastodon/initial_state';
import { makeGetStatus } from 'mastodon/selectors';

const getStatus = makeGetStatus();

// A single direct message rendered as a chat bubble. Own messages align to the
// right, everyone else's to the left (Twitter/X-style conversation view).
export const DmBubble = ({ id, focused }) => {
  const status = useSelector(state => getStatus(state, { id }));

  if (!status) {
    return null;
  }

  const account = status.get('account');
  const own = account.get('id') === me;
  const mediaAttachments = status.get('media_attachments');

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
    </AnimateEmojiProvider>
  );
};

DmBubble.propTypes = {
  id: PropTypes.string.isRequired,
  focused: PropTypes.bool,
};
