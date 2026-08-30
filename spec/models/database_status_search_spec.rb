# frozen_string_literal: true

require 'rails_helper'

RSpec.describe DatabaseStatusSearch do
  subject { described_class.new(viewer) }

  let(:viewer) { Fabricate(:account) }
  let(:stranger) { Fabricate(:account) }

  describe '#call' do
    it 'matches a visible status by a literal, case-insensitive substring' do
      status = Fabricate(:status, account: stranger, text: 'This one mentions Zebras specifically', visibility: :public)

      expect(subject.call('ZEBRAS', limit: 10)).to eq([status])
    end

    it 'matches an incomplete Korean word fragment against a longer word containing it' do
      status = Fabricate(:status, account: stranger, text: '오늘도 감사합니다', visibility: :public)

      expect(subject.call('감사합니', limit: 10)).to eq([status])
    end

    it 'does not include a status that is not visible to the viewer' do
      Fabricate(:status, account: stranger, text: 'zebras only for followers', visibility: :private)

      expect(subject.call('zebras', limit: 10)).to be_empty
    end

    it 'includes a private status once the viewer follows its author' do
      status = Fabricate(:status, account: stranger, text: 'zebras only for followers', visibility: :private)
      viewer.follow!(stranger)

      expect(subject.call('zebras', limit: 10)).to eq([status])
    end

    it 'excludes statuses from accounts the viewer blocks' do
      status = Fabricate(:status, account: stranger, text: 'zebras everywhere', visibility: :public)
      viewer.block!(stranger)

      expect(subject.call('zebras', limit: 10)).to_not include(status)
    end

    it 'restricts results to the given account_id' do
      matching_author = Fabricate(:status, account: stranger, text: 'zebras here', visibility: :public)
      other_author = Fabricate(:status, text: 'zebras there', visibility: :public)

      expect(subject.call('zebras', limit: 10, account_id: stranger.id)).to eq([matching_author])
      expect(subject.call('zebras', limit: 10, account_id: stranger.id)).to_not include(other_author)
    end

    it 'excludes remote statuses' do
      Fabricate(:status, account: Fabricate(:account, domain: 'remote.example'), text: 'zebras remotely', visibility: :public, uri: 'https://remote.example/1')

      expect(subject.call('zebras', limit: 10)).to be_empty
    end
  end
end
