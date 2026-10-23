# frozen_string_literal: true

class Api::V1::Admin::BioHpsController < Api::BaseController
  include Authorization

  before_action -> { authorize_if_got_token! :'admin:write', :'admin:write:accounts' }
  before_action :set_account
  before_action :require_local_account!

  after_action :verify_authorized

  def update
    authorize @account, :update_bio_hp?

    current_hp = Integer(params.require(:current_hp).to_s, 10)
    max_hp     = Integer(params.require(:max_hp).to_s, 10)
    return render json: { error: 'current_hp and max_hp must not be negative' }, status: 422 if current_hp.negative? || max_hp.negative?

    render json: { result: UpdateBioHpService.new.call(@account, current_hp: current_hp, max_hp: max_hp) }
  rescue ArgumentError
    render json: { error: 'current_hp and max_hp must be integers' }, status: 422
  end

  private

  def set_account
    @account = Account.find(params[:account_id])
  end

  def require_local_account!
    forbidden unless @account.local? && @account.user.present?
  end
end
