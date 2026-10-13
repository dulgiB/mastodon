# frozen_string_literal: true

class Auth::SwitchesController < ApplicationController
  # Someone parked on an account that can no longer be used still needs a way
  # out to one of their working accounts.
  skip_before_action :require_functional!

  before_action :authenticate_user!

  def create
    activation = MultiSession.find_by_account_id(cookies, params[:account_id])

    return render json: { error: 'unknown_session' }, status: 404 if activation.nil?

    switch_to!(activation)

    render json: { redirect_to: root_path }
  end

  # Unread notification counts for the browser's other accounts, keyed by
  # account id. The account currently signed in is left out: the web UI already
  # counts its notifications itself.
  def unread_counts
    counts = MultiSession.activations(cookies).each_with_object({}) do |activation, result|
      next if activation.user_id == current_user.id

      result[activation.user.account_id.to_s] = MultiSession::UnreadCounter.new(activation.user).count
    end

    render json: counts
  end

  private

  def switch_to!(activation)
    # Drops the Warden session for the account we are leaving without running
    # the logout hooks, which would revoke the very session it is holding. The
    # next request authenticates from the cookie set below.
    reset_session

    cookies.signed['_session_id'] = {
      value: activation.session_id,
      expires: 1.year.from_now,
      httponly: true,
      same_site: :lax,
    }

    MultiSession.mark_active(cookies, activation.user.account_id)
  end
end
