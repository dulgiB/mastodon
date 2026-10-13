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

  describe 'GET /auth/switch/unread_counts', :inline_jobs do
    context 'when signed out' do
      it 'does not answer' do
        get '/auth/switch/unread_counts'

        expect(response)
          .to_not have_http_status(200)
      end
    end

    context 'when both accounts signed in from this browser' do
      before do
        status = PostStatusService.new.call(alice.account, text: 'Test')
        FavouriteService.new.call(Fabricate(:account), status)
        FavouriteService.new.call(Fabricate(:account), status)
        FollowService.new.call(Fabricate(:account), alice.account)
        PostStatusService.new.call(Fabricate(:account), text: "Hello @#{alice.account.username}")

        sign_in alice
        get '/auth/edit'

        sign_in bob
        get '/auth/edit'
      end

      it 'counts unread notification groups for the other account only' do
        get '/auth/switch/unread_counts'

        expect(response)
          .to have_http_status(200)
        expect(response.parsed_body)
          .to eq(alice.account_id.to_s => 3)
      end

      it 'leaves out notifications older than the read marker' do
        Fabricate(:marker, user: alice, timeline: 'notifications', last_read_id: alice.account.notifications.maximum(:id))

        get '/auth/switch/unread_counts'

        expect(response.parsed_body)
          .to eq(alice.account_id.to_s => 0)
      end

      it 'leaves out the types the account hides from its notifications column' do
        Web::Setting.create!(user: alice, data: { notifications: { shows: { favourite: false } } })

        get '/auth/switch/unread_counts'

        expect(response.parsed_body)
          .to eq(alice.account_id.to_s => 2)
      end
    end
  end
end
