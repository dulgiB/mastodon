# frozen_string_literal: true

require 'rails_helper'

RSpec.describe DatabaseSearchQuery do
  subject { described_class.new(query, viewer) }

  let(:viewer) { Fabricate(:account) }

  describe '#text' do
    context 'with no operators' do
      let(:query) { 'zebras everywhere' }

      it 'keeps the whole query as one substring' do
        expect(subject.text).to eq('zebras everywhere')
      end
    end

    context 'with a supported operator' do
      let(:query) { 'is:reply zebras everywhere' }

      it 'strips the operator out of the substring' do
        expect(subject.text).to eq('zebras everywhere')
      end
    end

    context 'with an operator this backend cannot serve' do
      let(:query) { 'in:library has:media zebras' }

      it 'drops it instead of matching it as text' do
        expect(subject.text).to eq('zebras')
      end
    end

    context 'with a prefix that is not search syntax' do
      let(:query) { 'time:12:30' }

      it 'keeps it as the literal text the user typed' do
        expect(subject.text).to eq('time:12:30')
      end
    end

    context 'with an operator in front of text holding its own colons' do
      let(:query) { 'before:2024-01-01 a:b:c' }

      it 'cuts out the operator without disturbing the rest' do
        expect(subject.text).to eq('a:b:c')
      end
    end

    context 'with an emoji shortcode' do
      let(:query) { 'look :blobcat: here' }

      it 'keeps the shortcode whole' do
        expect(subject.text).to eq('look :blobcat: here')
      end
    end

    context 'with a quoted phrase' do
      let(:query) { '"zebras everywhere"' }

      it 'matches the phrase without its quotes' do
        expect(subject.text).to eq('zebras everywhere')
      end
    end

    context 'with a negated term' do
      let(:query) { 'zebras -giraffes' }

      it 'drops the term rather than searching for it' do
        expect(subject.text).to eq('zebras')
      end
    end

    context 'with nothing but operators' do
      let(:query) { 'is:reply' }

      it 'is nil' do
        expect(subject.text).to be_nil
      end
    end
  end

  describe '#impossible?' do
    context 'when from: names an account that does not exist' do
      let(:query) { 'from:@nobody@example.com zebras' }

      it { is_expected.to be_impossible }
    end

    context 'when a date will not parse' do
      let(:query) { 'before:soon zebras' }

      it { is_expected.to be_impossible }
    end

    context 'when a negated operator cannot be resolved' do
      let(:query) { '-from:@nobody@example.com zebras' }

      it 'is satisfiable, since excluding nothing rules nothing out' do
        expect(subject).to_not be_impossible
      end
    end

    context 'with an operator that resolves' do
      let(:query) { 'during:2024-03-01 zebras' }

      it { is_expected.to_not be_impossible }
    end
  end

  describe '#apply' do
    let(:query) { 'is:sensitive' }

    it 'returns a relation the caller can keep chaining' do
      expect(subject.apply(Status.all)).to be_a(ActiveRecord::Relation)
    end
  end
end
