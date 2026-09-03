# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'API V1 Timelines Archive' do
  let(:user)    { Fabricate(:user) }
  let(:scopes)  { 'read:statuses' }
  let(:token)   { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: scopes) }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }

  describe 'GET /api/v1/timelines/archive/:id' do
    let!(:status) { Fabricate(:status, visibility: :public) }
    let(:archive) { Fabricate(:archive, start_status_id: status.id, end_status_id: status.id) }

    it 'returns http success and the statuses in range' do
      get "/api/v1/timelines/archive/#{archive.id}", headers: headers

      expect(response).to have_http_status(200)
      expect(response.content_type).to start_with('application/json')
      expect(response.parsed_body.pluck(:id)).to contain_exactly(status.id.to_s)
    end

    context 'without a user context' do
      let(:token) { Fabricate(:accessible_access_token, resource_owner_id: nil, scopes: scopes) }

      it 'returns http unprocessable entity' do
        get "/api/v1/timelines/archive/#{archive.id}", headers: headers

        expect(response).to have_http_status(422)
      end
    end

    context 'with around_id' do
      let(:statuses) { Array.new(5) { Fabricate(:status, visibility: :public) } }
      let(:archive) { Fabricate(:archive, start_status_id: statuses.first.id, end_status_id: statuses.last.id) }

      it 'returns the target status and its surrounding context, unfiltered' do
        get "/api/v1/timelines/archive/#{archive.id}", params: { around_id: statuses[2].id }, headers: headers

        expect(response).to have_http_status(200)
        expect(response.parsed_body.pluck(:id)).to include(statuses[2].id.to_s)
      end
    end
  end
end
