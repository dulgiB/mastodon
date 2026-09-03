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

  describe 'GET /api/v1/archives/search' do
    let!(:matching_status)     { Fabricate(:status, text: 'this one mentions zebras', visibility: :public) }
    let!(:non_matching_status) { Fabricate(:status, text: 'nothing to see here', visibility: :public) }
    let!(:matching_episode)     { Fabricate(:archive, title: 'Has zebras', start_status_id: matching_status.id, end_status_id: matching_status.id) }
    let!(:non_matching_episode) { Fabricate(:archive, title: 'No zebras', start_status_id: non_matching_status.id, end_status_id: non_matching_status.id) }

    it 'returns only the episodes containing a visible match, case-insensitively' do
      get '/api/v1/archives/search', params: { q: 'ZEBRAS' }, headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body.pluck(:id))
        .to include(matching_episode.id.to_s)
        .and not_include(non_matching_episode.id.to_s)
    end

    it 'returns an empty array for a blank query' do
      get '/api/v1/archives/search', params: { q: '' }, headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body).to eq([])
    end

    it 'returns an empty array when nothing matches' do
      get '/api/v1/archives/search', params: { q: 'nonexistentqueryxyz' }, headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body).to eq([])
    end
  end

  describe 'GET /api/v1/archives/:id/matches' do
    let!(:earlier_match) { Fabricate(:status, text: 'this one mentions zebras', visibility: :public) }
    let!(:later_match)   { Fabricate(:status, text: 'more zebras here too', visibility: :public) }
    let!(:episode)       { Fabricate(:archive, start_status_id: earlier_match.id, end_status_id: later_match.id) }

    it 'returns the id of the earliest match when after_id is omitted, alongside its position and the total' do
      get "/api/v1/archives/#{episode.id}/matches", params: { q: 'zebras' }, headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body[:id]).to eq(earlier_match.id.to_s)
      expect(response.parsed_body[:index]).to eq(1)
      expect(response.parsed_body[:total]).to eq(2)
    end

    it 'returns the id of the next match after after_id, with an incremented position' do
      get "/api/v1/archives/#{episode.id}/matches", params: { q: 'zebras', after_id: earlier_match.id }, headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body[:id]).to eq(later_match.id.to_s)
      expect(response.parsed_body[:index]).to eq(2)
      expect(response.parsed_body[:total]).to eq(2)
    end

    it 'returns a null id and index, but the (zero) total, when nothing matches' do
      get "/api/v1/archives/#{episode.id}/matches", params: { q: 'nonexistentqueryxyz' }, headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body[:id]).to be_nil
      expect(response.parsed_body[:index]).to be_nil
      expect(response.parsed_body[:total]).to eq(0)
    end

    it 'returns a null id/index and zero total for a blank query' do
      get "/api/v1/archives/#{episode.id}/matches", params: { q: '' }, headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body[:id]).to be_nil
      expect(response.parsed_body[:index]).to be_nil
      expect(response.parsed_body[:total]).to eq(0)
    end

    it 'returns the id of the latest match when direction is prev and after_id is omitted' do
      get "/api/v1/archives/#{episode.id}/matches", params: { q: 'zebras', direction: 'prev' }, headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body[:id]).to eq(later_match.id.to_s)
      expect(response.parsed_body[:index]).to eq(2)
      expect(response.parsed_body[:total]).to eq(2)
    end

    it 'returns the id of the previous match before after_id when direction is prev' do
      get "/api/v1/archives/#{episode.id}/matches", params: { q: 'zebras', after_id: later_match.id, direction: 'prev' }, headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body[:id]).to eq(earlier_match.id.to_s)
      expect(response.parsed_body[:index]).to eq(1)
      expect(response.parsed_body[:total]).to eq(2)
    end
  end
end
