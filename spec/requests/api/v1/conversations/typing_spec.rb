# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'API V1 Conversations Typing' do
  include_context 'with API authentication', oauth_scopes: 'write:conversations'

  let!(:user) { Fabricate(:user, account_attributes: { username: 'alice' }) }

  let(:other)        { Fabricate(:user) }
  let(:conversation) { AccountConversation.find_by(account: user.account) }

  describe 'POST /api/v1/conversations/:id/typing', :inline_jobs do
    before do
      allow(redis).to receive(:publish)
      redis.set("subscribed:timeline:direct:#{other.account.id}", '1')

      user.account.follow!(other.account)
      PostStatusService.new.call(other.account, text: 'Hey @alice', visibility: 'direct')
    end

    it 'broadcasts a typing event to the other participant' do
      post "/api/v1/conversations/#{conversation.id}/typing", headers: headers

      expect(response).to have_http_status(200)
      expect(redis)
        .to have_received(:publish)
        .with("timeline:direct:#{other.account.id}", a_string_including('conversation.typing'))
        .once
    end

    it 'is throttled to one broadcast per window' do
      2.times { post "/api/v1/conversations/#{conversation.id}/typing", headers: headers }

      expect(redis).to have_received(:publish).once
    end

    it 'does not broadcast to a recipient who blocks the sender' do
      conversation # memoize before blocking
      other.account.block!(user.account)

      post "/api/v1/conversations/#{conversation.id}/typing", headers: headers

      expect(response).to have_http_status(200)
      expect(redis).to_not have_received(:publish)
    end

    it 'returns not found for a conversation the user is not part of' do
      post '/api/v1/conversations/0/typing', headers: headers

      expect(response).to have_http_status(404)
    end
  end
end
