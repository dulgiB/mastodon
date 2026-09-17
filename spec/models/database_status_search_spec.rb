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

  describe '#call with operators' do
    let!(:matching) { Fabricate(:status, account: stranger, text: 'zebras here', visibility: :public) }
    let!(:other) { Fabricate(:status, text: 'zebras there', visibility: :public) }

    it 'restricts to the author named by from:' do
      expect(subject.call("from:@#{stranger.username} zebras", limit: 10)).to eq([matching])
    end

    it 'restricts to the viewer for from:me' do
      own = Fabricate(:status, account: viewer, text: 'zebras of my own', visibility: :public)

      expect(subject.call('from:me zebras', limit: 10)).to eq([own])
    end

    it 'excludes the author named by a negated from:' do
      expect(subject.call("-from:@#{stranger.username} zebras", limit: 10)).to eq([other])
    end

    it 'returns nothing when from: names an account that does not exist' do
      expect(subject.call('from:@nobody@example.com zebras', limit: 10)).to be_empty
    end

    it 'restricts to replies for is:reply' do
      reply = Fabricate(:status, account: stranger, text: 'zebras in reply', visibility: :public, thread: other)

      expect(subject.call('is:reply zebras', limit: 10)).to eq([reply])
    end

    it 'restricts to sensitive statuses for is:sensitive' do
      sensitive = Fabricate(:status, account: stranger, text: 'zebras behind a warning', visibility: :public, sensitive: true)

      expect(subject.call('is:sensitive zebras', limit: 10)).to eq([sensitive])
    end

    it 'restricts to statuses carrying a poll for has:poll' do
      with_poll = Fabricate(:status, account: stranger, text: 'zebras or giraffes', visibility: :public, poll: Fabricate(:poll, account: stranger))

      expect(subject.call('has:poll zebras', limit: 10)).to eq([with_poll])
    end

    it 'restricts by language:' do
      korean = Fabricate(:status, account: stranger, text: 'zebras 얼룩말', visibility: :public, language: 'ko')

      expect(subject.call('language:ko zebras', limit: 10)).to eq([korean])
    end

    it 'restricts to statuses older than before:' do
      old = Fabricate(:status, account: stranger, text: 'zebras long ago', visibility: :public, created_at: '2024-03-01T12:00:00Z')

      expect(subject.call('before:2024-04-01 zebras', limit: 10)).to eq([old])
    end

    it 'restricts to statuses newer than after:' do
      Fabricate(:status, account: stranger, text: 'zebras long ago', visibility: :public, created_at: '2024-03-01T12:00:00Z')

      expect(subject.call('after:2024-04-01 zebras', limit: 10)).to contain_exactly(matching, other)
    end

    it 'restricts to the day named by during:' do
      same_day = Fabricate(:status, account: stranger, text: 'zebras that day', visibility: :public, created_at: '2024-03-01T12:00:00Z')
      Fabricate(:status, account: stranger, text: 'zebras the day after', visibility: :public, created_at: '2024-03-02T12:00:00Z')

      expect(subject.call('during:2024-03-01 zebras', limit: 10)).to eq([same_day])
    end

    it 'returns nothing when a date will not parse' do
      expect(subject.call('before:soon zebras', limit: 10)).to be_empty
    end

    it 'ignores operators it cannot serve rather than matching them as text' do
      expect(subject.call('in:library has:media zebras', limit: 10)).to contain_exactly(matching, other)
    end

    it 'matches a quoted phrase without its quotes' do
      expect(subject.call('"zebras here"', limit: 10)).to eq([matching])
    end

    it 'combines an operator with the account_id option' do
      expect(subject.call('is:reply zebras', limit: 10, account_id: stranger.id)).to be_empty
    end
  end
end
