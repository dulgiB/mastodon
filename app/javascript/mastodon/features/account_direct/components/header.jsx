import PropTypes from 'prop-types';

import { FormattedMessage } from 'react-intl';

import { NavLink } from 'react-router-dom';

import ImmutablePropTypes from 'react-immutable-proptypes';
import ImmutablePureComponent from 'react-immutable-pure-component';

import { AccountHeader } from '@/mastodon/components/account_header';

import MemorialNote from './memorial_note';
import MovedNote from './moved_note';

export default class Header extends ImmutablePureComponent {

  static propTypes = {
    accountId: PropTypes.string,
    account: ImmutablePropTypes.map,
    hideTabs: PropTypes.bool,
    hidden: PropTypes.bool,
  };

  render () {
    const { accountId, account, hidden, hideTabs } = this.props;

    if (!accountId || account === null) {
      return null;
    }

    return (
      <div className='account-timeline__header'>
        {(!hidden && account?.get('memorial')) && <MemorialNote />}
        {(!hidden && account?.get('moved')) && <MovedNote from={account} to={account.get('moved')} />}

        <AccountHeader accountId={accountId} hideTabs />

        {!(hideTabs || hidden) && (
          <div className='account__section-headline'>
            <NavLink exact to={`/@${account.get('acct')}`}><FormattedMessage id='account.posts' defaultMessage='Posts' /></NavLink>
            <NavLink exact to={`/@${account.get('acct')}/with_replies`}><FormattedMessage id='account.posts_with_replies' defaultMessage='Posts and replies' /></NavLink>
            <NavLink exact to={`/@${account.get('acct')}/media`}><FormattedMessage id='account.media' defaultMessage='Media' /></NavLink>
          </div>
        )}
      </div>
    );
  }

}
