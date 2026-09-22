# frozen_string_literal: true

# Keeps track of every session this browser has authenticated, so a user can
# switch between their accounts without entering credentials again.
#
# Only session identifiers are handed to the browser, in a signed httpOnly
# cookie. The credential itself never becomes readable by scripts, and every
# entry stays an ordinary SessionActivation, so it is listed and revocable on
# the sessions settings page like any other login.
module MultiSession
  COOKIE_NAME = '_session_ids'
  ACTIVE_ACCOUNT_COOKIE = '_active_account_id'
  LIMIT = 10

  # Marks a request as a sign-in that adds another account to this browser.
  # Warden hands back the account already in the session without ever running
  # the sign-in strategies, and the session activation strategy would sign that
  # same account straight back in, so both have to be told to step aside.
  ADDING_ACCOUNT = 'multi_session.adding_account'

  module_function

  def adding_account!(request)
    request.env[ADDING_ACCOUNT] = true
  end

  def adding_account?(request)
    request.env[ADDING_ACCOUNT].present?
  end

  # Readable by scripts on purpose: a tab renders for one account and has no
  # other way to notice that the browser has since switched to another, since
  # its API calls carry the token it was rendered with and keep working. It is
  # an identifier, never a credential, and is never trusted server-side.
  def mark_active(cookies, account_id)
    value = account_id.to_s
    return if cookies[ACTIVE_ACCOUNT_COOKIE] == value

    cookies[ACTIVE_ACCOUNT_COOKIE] = {
      value: value,
      expires: 1.year.from_now,
      httponly: false,
      same_site: :lax,
    }
  end

  def clear_active(cookies)
    cookies.delete(ACTIVE_ACCOUNT_COOKIE)
  end

  def session_ids(cookies)
    value = cookies.signed[COOKIE_NAME]
    return [] unless value.is_a?(Array)

    value.grep(String).uniq
  end

  # Records a session as belonging to this browser, most recent first.
  def remember(cookies, session_id)
    return if session_id.blank?

    ids = session_ids(cookies)
    return if ids.first == session_id && ids.size <= LIMIT

    write(cookies, ids.unshift(session_id).uniq.take(LIMIT))
  end

  def forget(cookies, session_id)
    ids = session_ids(cookies)
    remaining = ids - [session_id]
    return if remaining.size == ids.size

    write(cookies, remaining)
  end

  # Sessions this browser can switch to, most recently used first. Entries that
  # were revoked elsewhere, or whose account can no longer be used, are dropped.
  def activations(cookies)
    ids = session_ids(cookies)
    return [] if ids.empty?

    found = SessionActivation.where(session_id: ids).includes(user: :account).index_by(&:session_id)
    usable = ids.filter_map { |id| found[id] }.select { |activation| usable?(activation) }

    # Signing back into an account already on the list starts a second session
    # for it; the switcher only needs the most recent one.
    usable.uniq { |activation| activation.user.account_id }
  end

  def find_by_account_id(cookies, account_id)
    return if account_id.blank?

    activations(cookies).find { |activation| activation.user.account_id.to_s == account_id.to_s }
  end

  def usable?(activation)
    user = activation.user

    user.present? && user.account.present? && user.functional?
  end

  def write(cookies, ids)
    if ids.empty?
      cookies.delete(COOKIE_NAME)
    else
      cookies.signed[COOKIE_NAME] = {
        value: ids,
        expires: 1.year.from_now,
        httponly: true,
        same_site: :lax,
      }
    end
  end
end
