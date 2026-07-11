# frozen_string_literal: true

class CustomThemeController < ActionController::Base # rubocop:disable Rails/ApplicationController
  def show
    expires_in 1.month, public: true
    render content_type: :css
  end

  private

  def custom_theme_styles
    Setting.theme_custom_css
  end
  helper_method :custom_theme_styles
end
