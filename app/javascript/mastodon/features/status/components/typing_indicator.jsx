import PropTypes from 'prop-types';

import { FormattedMessage } from 'react-intl';

import { useSelector } from 'react-redux';

// A thin status line pinned above the reply composer for the currently open
// direct conversation — deliberately understated (no avatar, no bubble)
// rather than inserted into the message flow, since a full chat bubble for
// an ephemeral, no-content signal read as too heavy. Typing state is
// ephemeral and auto-expires (see the conversations reducer / actions), so
// this simply reflects whatever is fresh.
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
    <div className='typing-indicator' aria-live='polite'>
      <FormattedMessage
        id='conversation.is_typing'
        defaultMessage='{name} is typing…'
        values={{ name: names }}
      />
    </div>
  );
};

TypingIndicator.propTypes = {
  accountIds: PropTypes.arrayOf(PropTypes.string),
};
