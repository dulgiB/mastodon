# frozen_string_literal: true

require 'rails_helper'

RSpec.describe ThemeCssGenerator do
  describe '#to_css' do
    context 'when no values are provided' do
      it 'returns an empty string' do
        expect(described_class.new.to_css).to eq('')
      end

      it 'ignores blank values' do
        expect(described_class.new(brand: '', background: nil, text: '').to_css).to eq('')
      end
    end

    context 'when a brand color is provided' do
      subject { described_class.new(brand: '#ff0000').to_css }

      it 'overrides the brand tokens in both color schemes' do
        expect(subject).to include('--color-bg-brand-base: #ff0000;')
        expect(subject).to include("[data-color-scheme='dark'], html:not([data-color-scheme]) {")
        expect(subject).to include("[data-color-scheme='light'] {")
      end

      it 'derives the brand text token via color-mix per scheme' do
        expect(subject).to include('color-mix(in oklab, #ff0000, var(--color-white) 30%)')
        expect(subject).to include('color-mix(in oklab, #ff0000, var(--color-black) 20%)')
      end
    end

    context 'when background and text colors are provided' do
      subject { described_class.new(background: '#101010', background_secondary: '#202020', text: '#fafafa').to_css }

      it 'applies them only to the dark (default) scheme' do
        dark_block = subject.split("\n\n").find { |block| block.start_with?("[data-color-scheme='dark']") }

        expect(dark_block).to include('--color-bg-primary: #101010;')
        expect(dark_block).to include('--color-bg-secondary: #202020;')
        expect(dark_block).to include('--color-text-primary: #fafafa;')
      end
    end

    context 'when a hero image url is provided' do
      subject { described_class.new(hero_url: 'https://cdn.example/hero.png').to_css }

      it 'emits a background-image rule' do
        expect(subject).to include('background-image: url(https://cdn.example/hero.png);')
      end
    end
  end
end
