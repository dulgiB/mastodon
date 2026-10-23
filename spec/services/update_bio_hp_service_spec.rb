# frozen_string_literal: true

require 'rails_helper'

RSpec.describe UpdateBioHpService do
  subject { described_class.new.call(account, current_hp: current_hp, max_hp: 100) }

  let(:account) { Fabricate(:account, note: note) }
  let(:current_hp) { 70 }

  context 'with a single HP notation' do
    let(:note) { "모험가\n체력 100 / 100\n10/23 합류" }

    it 'replaces only the current HP and keeps the spacing' do
      expect(subject).to eq :updated
      expect(account.reload.note).to eq "모험가\n체력 70 / 100\n10/23 합류"
    end

    it 'distributes the profile update' do
      allow(ActivityPub::UpdateDistributionWorker).to receive(:perform_in)
      subject
      expect(ActivityPub::UpdateDistributionWorker).to have_received(:perform_in).with(anything, account.id)
    end
  end

  context 'when the current HP is already written' do
    let(:note) { '70/100' }

    it 'does not save' do
      expect { expect(subject).to eq :unchanged }.to_not(change { account.reload.updated_at })
    end
  end

  context 'without a notation matching the max HP' do
    let(:note) { '10/23, 50/1000' }

    it 'leaves the note untouched' do
      expect(subject).to eq :not_found
      expect(account.reload.note).to eq '10/23, 50/1000'
    end
  end

  context 'with more than one notation matching the max HP' do
    let(:note) { '5/100, 7/100' }

    it 'leaves the note untouched' do
      expect(subject).to eq :ambiguous
      expect(account.reload.note).to eq '5/100, 7/100'
    end
  end

  context 'when the new note would exceed the length limit' do
    let(:current_hp) { 100 }
    let(:note) { "#{'a' * (Account::NOTE_LENGTH_LIMIT - 6)}99/100" }

    it 'does not save' do
      expect(subject).to eq :invalid
      expect(account.reload.note).to end_with '99/100'
    end
  end
end
