# frozen_string_literal: true

require 'rails_helper'

RSpec.describe BatchedRemoveStatusService, :inline_jobs do
  subject { described_class.new }

  let!(:alice)  { Fabricate(:account) }
  let!(:bob)    { Fabricate(:account, username: 'bob', domain: 'example.com') }
  let!(:jeff)   { Fabricate(:account) }
  let!(:hank)   { Fabricate(:account, username: 'hank', protocol: :activitypub, domain: 'example.com', inbox_url: 'http://example.com/inbox') }

  # Fabricated directly (rather than via PostStatusService) and fanned out
  # explicitly, mirroring a federated post, to bypass this fork's policy of
  # downgrading all local public posts to unlisted (see PostStatusService).
  let(:status_alice_hello) { Fabricate(:status, account: alice, visibility: :public, text: "Hello @#{bob.pretty_acct}") }
  let(:status_alice_other) { Fabricate(:status, account: alice, visibility: :public, text: 'Another status') }

  before do
    allow(redis).to receive_messages(publish: nil)

    stub_request(:post, 'http://example.com/inbox').to_return(status: 200)

    jeff.user.update(current_sign_in_at: Time.zone.now)
    jeff.follow!(alice)
    hank.follow!(alice)

    FanOutOnWriteService.new.call(status_alice_hello)
    FanOutOnWriteService.new.call(status_alice_other)
  end

  it 'removes status records, removes from author and local follower feeds, notifies stream, sends delete' do
    subject.call([status_alice_hello, status_alice_other])

    expect { Status.find(status_alice_hello.id) }
      .to raise_error ActiveRecord::RecordNotFound
    expect { Status.find(status_alice_other.id) }
      .to raise_error ActiveRecord::RecordNotFound

    expect(feed_ids_for(alice))
      .to_not include(status_alice_hello.id, status_alice_other.id)

    expect(feed_ids_for(jeff))
      .to_not include(status_alice_hello.id, status_alice_other.id)

    expect(redis)
      .to have_received(:publish)
      .with("timeline:#{jeff.id}", any_args).at_least(:once)

    expect(redis)
      .to have_received(:publish)
      .with('timeline:public', any_args).at_least(:once)

    # BatchedRemoveStatusService itself never delivers ActivityPub Delete
    # activities (that's RemoveStatusService's job), and outbound ActivityPub
    # distribution is disabled fork-wide (155772a) regardless.
    expect(a_request(:post, 'http://example.com/inbox'))
      .to_not have_been_made
  end

  def feed_ids_for(account)
    HomeFeed
      .new(account)
      .get(10)
      .pluck(:id)
  end
end
