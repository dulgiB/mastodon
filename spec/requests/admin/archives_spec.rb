# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Admin Archives' do
  before { sign_in Fabricate(:admin_user) }

  describe 'GET /admin/archives' do
    it 'returns http success' do
      get admin_archives_path

      expect(response).to have_http_status(200)
    end

    context 'with grouped and ungrouped archives' do
      let(:archive_group) { Fabricate(:archive_group, title: 'Act 1') }

      before do
        Fabricate(:archive, title: 'Grouped episode', archive_group: archive_group)
        Fabricate(:archive, title: 'Loose episode')
      end

      it 'lists both under their group headings' do
        get admin_archives_path

        expect(response.body)
          .to include('Act 1')
          .and include('Grouped episode')
          .and include('Loose episode')
      end
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

    it 'assigns the archive to a group' do
      archive_group = Fabricate(:archive_group)

      put admin_archive_path(archive), params: { archive: { archive_group_id: archive_group.id } }

      expect(archive.reload.archive_group).to eq(archive_group)
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
