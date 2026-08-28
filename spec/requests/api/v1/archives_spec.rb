# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'API V1 Archives' do
  let(:user)    { Fabricate(:user) }
  let(:token)   { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: 'read:statuses') }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }

  describe 'GET /api/v1/archives' do
    let!(:second_episode) { Fabricate(:archive, start_status_id: 200, end_status_id: 299) }
    let!(:first_episode)  { Fabricate(:archive, start_status_id: 100, end_status_id: 199) }

    it 'returns the archives ordered by start_status_id' do
      get '/api/v1/archives', headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body.pluck(:id)).to eq([first_episode.id.to_s, second_episode.id.to_s])
    end

    context 'without a user context' do
      let(:token) { Fabricate(:accessible_access_token, resource_owner_id: nil, scopes: 'read:statuses') }

      it 'returns http unprocessable entity' do
        get '/api/v1/archives', headers: headers

        expect(response).to have_http_status(422)
      end
    end
  end
end
