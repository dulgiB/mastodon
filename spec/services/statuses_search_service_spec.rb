# frozen_string_literal: true

require 'rails_helper'

RSpec.describe StatusesSearchService do
  describe '#call' do
    let!(:status) { Fabricate(:status, text: 'status number one') }
    let(:results) { subject.call('one', status.account, limit: 5) }

    before { Fabricate(:status, text: 'status number two') }

    context 'when elasticsearch is enabled', :search do
      it 'runs a search for statuses' do
        expect(results)
          .to have_attributes(
            size: 1,
            first: eq(status)
          )
      end
    end

    context 'when elasticsearch is disabled' do
      before { allow(Chewy).to receive(:enabled?).and_return(false) }

      it 'falls back to a literal database substring search' do
        expect(results)
          .to have_attributes(
            size: 1,
            first: eq(status)
          )
      end

      it 'returns no results for a blank query' do
        expect(subject.call('', status.account, limit: 5)).to be_empty
      end
    end
  end
end
