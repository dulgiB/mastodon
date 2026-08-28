# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Admin Archives' do
  before { sign_in Fabricate(:admin_user) }

  describe 'GET /admin/archives' do
    it 'returns http success' do
      get admin_archives_path

      expect(response).to have_http_status(200)
    end
  end

  describe 'POST /admin/archives' do
    it 'creates a new archive' do
      expect do
        post admin_archives_path(archive: { title: 'Episode 1', start_status_id: 100, end_status_id: 200 })
      end.to change(Archive, :count).by(1)

      expect(response).to redirect_to(admin_archives_path)
    end

    it 'does not create an archive with an invalid range' do
      expect do
        post admin_archives_path(archive: { title: 'Episode 1', start_status_id: 200, end_status_id: 100 })
      end.to_not change(Archive, :count)

      expect(response).to have_http_status(200)
    end
  end

  describe 'PUT /admin/archives/:id' do
    let(:archive) { Fabricate(:archive) }

    it 'updates the archive' do
      put admin_archive_path(archive), params: { archive: { title: 'Updated title' } }

      expect(response).to redirect_to(admin_archives_path)
      expect(archive.reload.title).to eq('Updated title')
    end
  end

  describe 'DELETE /admin/archives/:id' do
    let!(:archive) { Fabricate(:archive) }

    it 'deletes the archive' do
      expect do
        delete admin_archive_path(archive)
      end.to change(Archive, :count).by(-1)

      expect(response).to redirect_to(admin_archives_path)
    end
  end
end
