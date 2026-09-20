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
