import { connect } from 'react-redux';

import { normalizeForLookup } from 'mastodon/reducers/accounts_map';
import { getAccountHidden } from 'mastodon/selectors';
import { makeGetAccount } from '../../../selectors';
import Header from '../components/header';

const makeMapStateToProps = () => {
  const getAccount = makeGetAccount();

  const mapStateToProps = (state, { accountId }) => ({
    accountId,
    account: getAccount(state, accountId),
    hidden: getAccountHidden(state, accountId),
  });

  return mapStateToProps;
};

export default connect(makeMapStateToProps)(Header);
