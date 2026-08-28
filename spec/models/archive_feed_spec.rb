# frozen_string_literal: true

require 'rails_helper'

RSpec.describe ArchiveFeed do
  let(:viewer)   { Fabricate(:account) }
  let(:friend)   { Fabricate(:account) }
  let(:stranger) { Fabricate(:account) }
  let(:remote)   { Fabricate(:account, domain: 'remote.example') }

  before { Fabricate(:follow, account: viewer, target_account: friend) }

  describe '#get' do
    it 'includes only what the viewer is allowed to see, within the archived range, local-only' do
      public_status = Fabricate(:status, account: stranger, visibility: :public)
      unlisted_status = Fabricate(:status, account: stranger, visibility: :unlisted)
      followed_private_status = Fabricate(:status, account: friend, visibility: :private)
      unfollowed_private_status = Fabricate(:status, account: stranger, visibility: :private)
      mentioned_direct_status = Fabricate(:status, account: stranger, visibility: :direct)
      Fabricate(:mention, status: mentioned_direct_status, account: viewer)
      unmentioned_direct_status = Fabricate(:status, account: stranger, visibility: :direct)
      Fabricate(:mention, status: unmentioned_direct_status, account: friend)
      own_status = Fabricate(:status, account: viewer, visibility: :private)
      remote_status = Fabricate(:status, account: remote, visibility: :public)

      all_ids = [
        public_status, unlisted_status, followed_private_status, unfollowed_private_status,
        mentioned_direct_status, unmentioned_direct_status, own_status, remote_status
      ].map(&:id)
      archive = Fabricate(:archive, start_status_id: all_ids.min, end_status_id: all_ids.max)

      results = described_class.new(archive, viewer).get(20)

      expect(results).to contain_exactly(public_status, unlisted_status, followed_private_status, mentioned_direct_status, own_status)
    end

    it 'excludes statuses outside the archived ID range' do
      inside = Fabricate(:status, account: stranger, visibility: :public)
      archive = Fabricate(:archive, start_status_id: inside.id, end_status_id: inside.id)
      outside = Fabricate(:status, account: stranger, visibility: :public)

      results = described_class.new(archive, viewer).get(20)

      expect(results).to contain_exactly(inside)
      expect(results).to_not include(outside)
    end

    it 'excludes statuses from accounts that have blocked the viewer' do
      status = Fabricate(:status, account: stranger, visibility: :public)
      Fabricate(:block, account: stranger, target_account: viewer)
      archive = Fabricate(:archive, start_status_id: status.id, end_status_id: status.id)

      results = described_class.new(archive, viewer).get(20)

      expect(results).to be_empty
    end
  end
end
