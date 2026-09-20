import api from 'mastodon/api';

export async function switchAccount(accountId: string) {
  try {
    const response = await api(false).post<{ redirect_to?: string }>(
      '/auth/switch',
      { account_id: accountId },
      { headers: { Accept: 'application/json' }, withCredentials: true },
    );

    if (response.status === 200 && response.data.redirect_to) {
      const target = response.data.redirect_to;

      // The whole app is reloaded so no state from the previous account is
      // carried over into the new one.
      if (window.location.pathname === target) {
        window.location.reload();
      } else {
        window.location.href = target;
      }

      return;
    }

    console.error(
      'Failed to switch account, got an unexpected non-redirect response from the server',
      response,
    );
  } catch (error) {
    console.error('Failed to switch account, response was an error', error);
  }
}
