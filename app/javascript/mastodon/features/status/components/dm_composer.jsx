import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import PropTypes from 'prop-types';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import { useDispatch } from 'react-redux';

import SendIcon from '@/material-icons/400-24px/arrow_upward-fill.svg?react';
import { sendDirectReplyTyping, submitDirectReply } from 'mastodon/actions/conversations';
import { IconButton } from 'mastodon/components/icon_button';

const messages = defineMessages({
  placeholder: { id: 'conversation.reply_placeholder', defaultMessage: 'Type a message…' },
  send: { id: 'conversation.send', defaultMessage: 'Send' },
});

// A messenger-style reply bar pinned to the bottom of an open direct
// conversation. Kept deliberately independent of the global `compose` state:
// submitDirectReply resolves "reply to the bottom of the thread" against the
// store at send time, and posting from here must not stomp an unrelated
// draft the user has open in the sidebar composer (or vice versa).
export const DmComposer = ({ rootId }) => {
  const intl = useIntl();
  const dispatch = useDispatch();
  const textareaRef = useRef(null);

  const [text, setText] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  // Grow the textarea with its content, up to a few lines, like a chat app.
  useLayoutEffect(() => {
    const node = textareaRef.current;
    if (!node) {
      return;
    }
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }, [text]);

  const handleChange = useCallback(e => {
    setText(e.target.value);
    setError(false);
    dispatch(sendDirectReplyTyping(rootId));
  }, [dispatch, rootId]);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();

    if (!trimmed || isSubmitting) {
      return;
    }

    setSubmitting(true);

    dispatch(submitDirectReply(rootId, trimmed))
      .then(() => {
        setText('');
        setSubmitting(false);
        textareaRef.current?.focus();
      })
      .catch(() => {
        setSubmitting(false);
        setError(true);
      });
  }, [dispatch, rootId, text, isSubmitting]);

  const handleKeyDown = useCallback(e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div className='dm-composer'>
      <textarea
        ref={textareaRef}
        className='dm-composer__textarea'
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={intl.formatMessage(messages.placeholder)}
        disabled={isSubmitting}
        rows={1}
      />

      <IconButton
        className='dm-composer__send'
        icon='send'
        iconComponent={SendIcon}
        title={intl.formatMessage(messages.send)}
        onClick={handleSubmit}
        disabled={isSubmitting || text.trim().length === 0}
      />

      {error && (
        <span className='dm-composer__error' role='alert'>
          <FormattedMessage id='conversation.send_error' defaultMessage='Message could not be sent' />
        </span>
      )}
    </div>
  );
};

DmComposer.propTypes = {
  rootId: PropTypes.string.isRequired,
};
