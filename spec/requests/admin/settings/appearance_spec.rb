# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Admin Settings Appearance' do
  describe 'When signed in as an admin' do
    before { sign_in Fabricate(:admin_user) }

    describe 'GET /admin/settings/appearance/preview' do
      it 'renders generated CSS from valid unsaved color params' do
        get preview_admin_settings_appearance_path(theme_color_brand: '#ff0000')

        expect(response).to have_http_status(200)
        expect(response.body).to include('--color-bg-brand-base: #ff0000;')
      end

      it 'ignores invalid color values instead of reflecting them' do
        get preview_admin_settings_appearance_path(theme_color_brand: '</style><script>')

        expect(response).to have_http_status(200)
        expect(response.body).to_not include('<script>')
      end
    end
  end

  describe 'When signed in as a non-admin' do
    before { sign_in Fabricate(:user) }

    it 'does not authorize the preview' do
      get preview_admin_settings_appearance_path(theme_color_brand: '#ff0000')

      expect(response).to have_http_status(403).or have_http_status(:redirect)
    end
  end
end
