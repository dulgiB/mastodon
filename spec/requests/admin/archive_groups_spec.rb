# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Admin Archive Groups' do
  before { sign_in Fabricate(:admin_user) }

  describe 'GET /admin/archive_groups/new' do
    it 'returns http success' do
      get new_admin_archive_group_path

      expect(response).to have_http_status(200)
    end
  end

  describe 'POST /admin/archive_groups' do
    it 'creates a new group' do
      expect do
        post admin_archive_groups_path(archive_group: { title: 'Act 1', position: 1 })
      end.to change(ArchiveGroup, :count).by(1)

      expect(response).to redirect_to(admin_archives_path)
    end

    it 'does not create a group without a title' do
      expect do
        post admin_archive_groups_path(archive_group: { title: '', position: 1 })
      end.to_not change(ArchiveGroup, :count)

      expect(response).to have_http_status(200)
    end
  end

  describe 'PUT /admin/archive_groups/:id' do
    let(:archive_group) { Fabricate(:archive_group) }

    it 'updates the group' do
      put admin_archive_group_path(archive_group), params: { archive_group: { title: 'Interludes', position: 5 } }

      expect(response).to redirect_to(admin_archives_path)
      expect(archive_group.reload).to have_attributes(title: 'Interludes', position: 5)
    end
  end

  describe 'DELETE /admin/archive_groups/:id' do
    let!(:archive_group) { Fabricate(:archive_group) }
    let!(:archive) { Fabricate(:archive, archive_group: archive_group) }

    it 'deletes the group and keeps its archives' do
      expect do
        delete admin_archive_group_path(archive_group)
      end.to change(ArchiveGroup, :count).by(-1)

      expect(response).to redirect_to(admin_archives_path)
      expect(archive.reload.archive_group).to be_nil
    end
  end
end
