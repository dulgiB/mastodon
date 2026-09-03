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

  describe '#match?' do
    it 'is true when a visible status in range literally contains the query, case-insensitively' do
      status = Fabricate(:status, account: stranger, text: 'This one mentions Zebras specifically', visibility: :public)
      archive = Fabricate(:archive, start_status_id: status.id, end_status_id: status.id)

      expect(described_class.new(archive, viewer).match?('ZEBRAS')).to be(true)
    end

    it 'matches on a literal substring of Korean text, not a whole word (not morphological search)' do
      status = Fabricate(:status, account: stranger, text: '오늘도 감사합니다', visibility: :public)
      archive = Fabricate(:archive, start_status_id: status.id, end_status_id: status.id)

      expect(described_class.new(archive, viewer).match?('감사합니')).to be(true)
    end

    it 'matches the spoiler (content warning) text too' do
      status = Fabricate(:status, account: stranger, spoiler_text: 'unicornwarning', visibility: :public)
      archive = Fabricate(:archive, start_status_id: status.id, end_status_id: status.id)

      expect(described_class.new(archive, viewer).match?('unicornwarning')).to be(true)
    end

    it 'is false when nothing in range matches' do
      status = Fabricate(:status, account: stranger, text: 'unrelated content', visibility: :public)
      archive = Fabricate(:archive, start_status_id: status.id, end_status_id: status.id)

      expect(described_class.new(archive, viewer).match?('zebras')).to be(false)
    end

    it 'is false when the only match is not visible to the viewer' do
      status = Fabricate(:status, account: stranger, text: 'zebras only for followers', visibility: :private)
      archive = Fabricate(:archive, start_status_id: status.id, end_status_id: status.id)

      expect(described_class.new(archive, viewer).match?('zebras')).to be(false)
    end

    it 'treats a literal % in the query as a literal character, not a SQL wildcard' do
      literal_match = Fabricate(:status, account: stranger, text: '50% off today', visibility: :public)
      would_match_if_unescaped = Fabricate(:status, account: stranger, text: '50X off today', visibility: :public)

      literal_archive = Fabricate(:archive, start_status_id: literal_match.id, end_status_id: literal_match.id)
      wildcard_archive = Fabricate(:archive, start_status_id: would_match_if_unescaped.id, end_status_id: would_match_if_unescaped.id)

      expect(described_class.new(literal_archive, viewer).match?('50% off')).to be(true)
      expect(described_class.new(wildcard_archive, viewer).match?('50% off')).to be(false)
    end
  end

  describe '#next_match_id' do
    it 'returns the earliest visible match when after_id is omitted' do
      earlier = Fabricate(:status, account: stranger, text: 'zebras are here', visibility: :public)
      later = Fabricate(:status, account: stranger, text: 'more zebras later', visibility: :public)
      archive = Fabricate(:archive, start_status_id: earlier.id, end_status_id: later.id)

      expect(described_class.new(archive, viewer).next_match_id('zebras')).to eq(earlier.id)
    end

    it 'returns the next visible match after after_id' do
      earlier = Fabricate(:status, account: stranger, text: 'zebras are here', visibility: :public)
      later = Fabricate(:status, account: stranger, text: 'more zebras later', visibility: :public)
      archive = Fabricate(:archive, start_status_id: earlier.id, end_status_id: later.id)

      expect(described_class.new(archive, viewer).next_match_id('zebras', after_id: earlier.id)).to eq(later.id)
    end

    it 'returns nil once every match has been passed' do
      status = Fabricate(:status, account: stranger, text: 'zebras are here', visibility: :public)
      archive = Fabricate(:archive, start_status_id: status.id, end_status_id: status.id)

      expect(described_class.new(archive, viewer).next_match_id('zebras', after_id: status.id)).to be_nil
    end

    it 'skips a match the viewer is not allowed to see' do
      hidden = Fabricate(:status, account: stranger, text: 'zebras only for followers', visibility: :private)
      visible = Fabricate(:status, account: stranger, text: 'zebras for everyone', visibility: :public)
      archive = Fabricate(:archive, start_status_id: hidden.id, end_status_id: visible.id)

      expect(described_class.new(archive, viewer).next_match_id('zebras')).to eq(visible.id)
    end
  end

  describe '#around' do
    it 'returns the target status plus up to `limit` on each side, unfiltered by any query' do
      statuses = Array.new(7) { Fabricate(:status, account: stranger, visibility: :public) }
      archive = Fabricate(:archive, start_status_id: statuses.first.id, end_status_id: statuses.last.id)
      target = statuses[3]

      results = described_class.new(archive, viewer).around(target.id, 2)

      expect(results).to match_array(statuses[1..5])
    end

    it 'excludes statuses outside the archived range or not visible to the viewer' do
      before_range = Fabricate(:status, account: stranger, visibility: :public)
      hidden = Fabricate(:status, account: stranger, visibility: :private)
      target = Fabricate(:status, account: stranger, visibility: :public)
      after_range = Fabricate(:status, account: stranger, visibility: :public)
      archive = Fabricate(:archive, start_status_id: hidden.id, end_status_id: target.id)

      results = described_class.new(archive, viewer).around(target.id, 5)

      expect(results).to contain_exactly(target)
      expect(results).to_not include(before_range, hidden, after_range)
    end
  end
end
