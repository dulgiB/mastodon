# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Archive do
  describe 'validations' do
    it 'is invalid without a title' do
      archive = Fabricate.build(:archive, title: '')
      expect(archive).to_not be_valid
    end

    it 'is invalid when end_status_id is before start_status_id' do
      archive = Fabricate.build(:archive, start_status_id: 200, end_status_id: 100)
      expect(archive).to_not be_valid
    end

    it 'is valid when end_status_id equals start_status_id' do
      archive = Fabricate.build(:archive, start_status_id: 100, end_status_id: 100)
      expect(archive).to be_valid
    end
  end

  describe '#previous and #next' do
    let!(:first)  { Fabricate(:archive, start_status_id: 100, end_status_id: 199) }
    let!(:second) { Fabricate(:archive, start_status_id: 200, end_status_id: 299) }
    let!(:third)  { Fabricate(:archive, start_status_id: 300, end_status_id: 399) }

    it 'finds the adjacent archives ordered by start_status_id' do
      expect(second.previous).to eq(first)
      expect(second.next).to eq(third)
      expect(first.previous).to be_nil
      expect(third.next).to be_nil
    end
  end
end
