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

  const check = () => {
    if (reloading || document.visibilityState !== 'visible') {
      return;
    }

    // A missing cookie means the browser was signed out elsewhere, which this
    // tab needs to pick up too.
    if (activeAccountId() === me) {
      return;
    }

    reloading = true;
    window.location.reload();
  };

  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', check);
}
