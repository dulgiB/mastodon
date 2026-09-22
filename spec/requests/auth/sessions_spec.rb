# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Auth Sessions' do
  describe 'POST /auth/sign_in' do
    # The rack-attack check has issues with the non-nested invalid param used here
    before { Rack::Attack.enabled = false }
    after { Rack::Attack.enabled = true }

    it 'gracefully handles invalid nested params' do
      post user_session_path(user: 'invalid')

      expect(response)
        .to have_http_status(400)
    end
  end

  describe 'GET /auth/sign_in' do
    context 'when already signed in' do
      before { sign_in Fabricate(:user) }

      it 'redirects away' do
        get new_user_session_path

        expect(response)
          .to have_http_status(302)
      end

      it 'serves the form when adding another account' do
        get new_user_session_path(add_account: '1')

        expect(response)
          .to have_http_status(200)
        expect(response.body)
          .to include(I18n.t('auth.add_account.title'))
      end
    end
  end
end
