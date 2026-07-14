import PropTypes from 'prop-types';

import { FormattedMessage } from 'react-intl';

import { useSelector } from 'react-redux';

// Shows an animated "… is typing" bubble for participants of the currently open
// direct conversation. Typing state is ephemeral and auto-expires (see the
// conversations reducer / actions), so this simply reflects whatever is fresh.
export const TypingIndicator = ({ accountIds = [] }) => {
  const typing = useSelector(state => state.getIn(['conversations', 'typing']));
  const accounts = useSelector(state => state.get('accounts'));

  const typingAccounts = accountIds
    .filter(id => typing?.has(id))
    .map(id => accounts.get(id))
    .filter(Boolean);

  if (typingAccounts.length === 0) {
    return null;
  }

  const names = typingAccounts
    .map(account => account.get('display_name')?.trim() || account.get('username'))
    .join(', ');

  return (
    <div className='conversation-bubble conversation-bubble--typing' aria-live='polite'>
      <div className='conversation-bubble__body'>
        <span className='typing-indicator__dots' aria-hidden='true'>
          <span />
          <span />
          <span />
        </span>
        <span className='typing-indicator__label'>
          <FormattedMessage
            id='conversation.is_typing'
            defaultMessage='{name} is typing…'
            values={{ name: names }}
          />
        </span>
      </div>
    </div>
  );
};

TypingIndicator.propTypes = {
  accountIds: PropTypes.arrayOf(PropTypes.string),
};
