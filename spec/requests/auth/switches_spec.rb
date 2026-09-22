# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Auth Switches' do
  let(:alice) { Fabricate(:user) }
  let(:bob) { Fabricate(:user) }

  describe 'POST /auth/switch' do
    context 'when signed out' do
      it 'does not switch' do
        post '/auth/switch', params: { account_id: alice.account_id }

        expect(response)
          .to_not have_http_status(200)
      end
    end

    context 'when the target session was not established from this browser' do
      before do
        sign_in alice
        get '/auth/edit'
      end

      it 'refuses to switch' do
        Fabricate(:session_activation, user: bob)

        post '/auth/switch', params: { account_id: bob.account_id }

        expect(response)
          .to have_http_status(404)
      end
    end

    context 'when both accounts signed in from this browser' do
      before do
        sign_in alice
        get '/auth/edit'

        sign_in bob
        get '/auth/edit'
      end

      it 'switches back to the account signed in first' do
        post '/auth/switch', params: { account_id: alice.account_id }

        expect(response)
          .to have_http_status(200)
        expect(response.parsed_body[:redirect_to])
          .to eq root_path
      end

      it 'publishes the active account so other tabs notice the switch' do
        expect(cookies[MultiSession::ACTIVE_ACCOUNT_COOKIE])
          .to eq bob.account_id.to_s

        post '/auth/switch', params: { account_id: alice.account_id }

        expect(cookies[MultiSession::ACTIVE_ACCOUNT_COOKIE])
          .to eq alice.account_id.to_s
      end
    end
  end
end
