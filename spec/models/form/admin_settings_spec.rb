# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Form::AdminSettings do
  describe 'Validations' do
    describe 'site_contact_username' do
      context 'with no accounts' do
        it { is_expected.to_not allow_value('Test').for(:site_contact_username) }
      end

      context 'with an account' do
        before { Fabricate(:account, username: 'Glorp') }

        it { is_expected.to_not allow_value('Test').for(:site_contact_username) }
        it { is_expected.to allow_value('Glorp').for(:site_contact_username) }
      end
    end
  end

  describe '#save' do
    describe 'updating digest values' do
      context 'when updating custom css to real value' do
        subject { described_class.new(custom_css: css) }

        let(:css) { 'body { color: red; }' }
        let(:digested) { Digest::SHA256.hexdigest(css) }

        it 'changes relevant digest value' do
          expect { subject.save }
            .to(change { Rails.cache.read(:setting_digest_custom_css) }.to(digested))
        end
      end

      context 'when updating custom css to empty value' do
        subject { described_class.new(custom_css: '') }

        before { Rails.cache.write(:setting_digest_custom_css, 'previous-value') }

        it 'changes relevant digest value' do
          expect { subject.save }
            .to(change { Rails.cache.read(:setting_digest_custom_css) }.to(be_blank))
        end
      end

      context 'when updating other fields' do
        subject { described_class.new(site_contact_email: 'test@example.host') }

        it 'does not update digests' do
          expect { subject.save }
            .to(not_change { Rails.cache.read(:setting_digest_custom_css) })
        end
      end
    end

    describe 'generating theme custom CSS from brand colors' do
      context 'when a brand color is provided' do
        subject { described_class.new(theme_color_brand: '#ff0000') }

        it 'stores generated CSS and refreshes its digest' do
          expect { subject.save }
            .to(change(Setting, :theme_custom_css).to(include('--color-bg-brand-base: #ff0000;')))
          expect(Rails.cache.read(:setting_digest_theme_custom_css)).to be_present
        end
      end

      context 'when brand colors are cleared' do
        subject { described_class.new(theme_color_brand: '') }

        before do
          Setting.theme_custom_css = 'stale'
          Rails.cache.write(:setting_digest_theme_custom_css, 'previous-value')
        end

        it 'clears generated CSS and its digest' do
          expect { subject.save }
            .to(change(Setting, :theme_custom_css).to(be_blank))
          expect(Rails.cache.read(:setting_digest_theme_custom_css)).to be_blank
        end
      end

      context 'when an invalid hex color is provided' do
        subject { described_class.new(theme_color_brand: 'notacolor') }

        it 'is invalid and does not save' do
          expect(subject.save).to be false
          expect(subject.errors[:theme_color_brand]).to be_present
        end
      end
    end
  end

  describe '#persisted?' do
    it { is_expected.to be_persisted }
  end
end
