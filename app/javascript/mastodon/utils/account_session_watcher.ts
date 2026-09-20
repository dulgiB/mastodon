import { me } from 'mastodon/initial_state';

// Set by the server alongside the session cookie, and script-readable on
// purpose. A tab holds the access token it was rendered with, so its API calls
// keep succeeding as the old account after the browser switches to another one
// somewhere else. Comparing this against the account the tab was rendered for
// is what lets it notice.
const COOKIE_NAME = '_active_account_id';

const activeAccountId = () =>
  document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);

export function watchAccountSession() {
  if (!me) {
    return;
  }

  let reloading = false;

  // A cookie that was never there says nothing: it may not be stored at all.
  // Taking that for a sign-out would reload the tab, find it still missing on
  // the next pageshow, and reload again. Only a cookie seen going away is
  // evidence that the browser left this account.
  let seen = Boolean(activeAccountId());

  const check = () => {
    if (reloading || document.visibilityState !== 'visible') {
      return;
    }

    const active = activeAccountId();

    if (active) {
      seen = true;

      if (active === me) {
        return;
      }
    } else if (!seen) {
      return;
    }

    reloading = true;
    window.location.reload();
  };

  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', check);
}
