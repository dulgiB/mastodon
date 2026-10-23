# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Bio HP' do
  include_context 'with API authentication', user_fabricator: :admin_user, oauth_scopes: 'admin:write admin:write:accounts'

  describe 'PUT /api/v1/admin/accounts/:account_id/bio_hp' do
    subject do
      put "/api/v1/admin/accounts/#{target_account.id}/bio_hp", headers: headers, params: params
    end

    let(:target_account) { Fabricate(:account, note: '체력 100/100') }
    let(:params) { { current_hp: 42, max_hp: 100 } }

    it_behaves_like 'forbidden for wrong scope', 'admin:read admin:read:accounts'
    it_behaves_like 'forbidden for wrong role', ''
    it_behaves_like 'forbidden for disabled user'

    it 'updates the HP in the note' do
      subject

      expect(response).to have_http_status(200)
      expect(response.parsed_body).to include(result: 'updated')
      expect(target_account.reload.note).to eq '체력 42/100'
    end

    context 'with a remote account' do
      let(:target_account) { Fabricate(:account, domain: 'example.com', note: '체력 100/100') }

      it 'returns http forbidden' do
        subject

        expect(response).to have_http_status(403)
      end
    end

    context 'with a non-integer value' do
      let(:params) { { current_hp: 'abc', max_hp: 100 } }

      it 'returns http unprocessable entity' do
        subject

        expect(response).to have_http_status(422)
        expect(target_account.reload.note).to eq '체력 100/100'
      end
    end
  end
end
