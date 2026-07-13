# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Custom theme CSS routes' do
  describe 'the theme digest route' do
    it 'routes to correct place' do
      expect(get('/theme_css/custom-1a2s3d4f.css'))
        .to route_to('custom_theme#show', id: 'custom-1a2s3d4f', format: 'css')
    end
  end
end
