import PropTypes from 'prop-types';

import { defineMessages, useIntl } from 'react-intl';

import ArrowDownwardIcon from '@/material-icons/400-24px/arrow_downward-fill.svg?react';
import { IconButton } from 'mastodon/components/icon_button';

const messages = defineMessages({
  scrollToBottom: { id: 'conversation.scroll_to_bottom', defaultMessage: 'Scroll to latest message' },
});

export const ScrollToBottomButton = ({ count, onClick }) => {
  const intl = useIntl();

  return (
    <IconButton
      className='scroll-to-bottom-button'
      title={intl.formatMessage(messages.scrollToBottom)}
      icon='arrow-down'
      iconComponent={ArrowDownwardIcon}
      counter={count > 0 ? count : undefined}
      onClick={onClick}
    />
  );
};

ScrollToBottomButton.propTypes = {
  count: PropTypes.number,
  onClick: PropTypes.func.isRequired,
};
