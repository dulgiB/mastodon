# frozen_string_literal: true

require 'rails_helper'

RSpec.describe ArchiveGroup do
  describe 'Validations' do
    it { is_expected.to validate_presence_of(:title) }
  end

  describe '.ordered' do
    let!(:second) { Fabricate(:archive_group, position: 2) }
    let!(:first)  { Fabricate(:archive_group, position: 1) }

    it 'orders by position' do
      expect(described_class.ordered).to eq([first, second])
    end
  end

  describe '#destroy' do
    let(:archive_group) { Fabricate(:archive_group) }
    let!(:archive) { Fabricate(:archive, archive_group: archive_group) }

    it 'keeps the archives, ungrouped' do
      archive_group.destroy

      expect(archive.reload.archive_group).to be_nil
    end
  end
end
