# frozen_string_literal: true

class Admin::Settings::AppearanceController < Admin::SettingsController
  # Renders a live, unsaved preview of the theme branding colors. Values come
  # from the (not-yet-saved) form fields; only valid hex colors are honored so
  # the reflected values cannot break out of the generated <style> block.
  def preview
    authorize :settings, :show?

    @preview_css = ThemeCssGenerator.new(
      brand: sanitized_color(params[:theme_color_brand]),
      background: sanitized_color(params[:theme_color_background]),
      background_secondary: sanitized_color(params[:theme_color_background_secondary]),
      text: sanitized_color(params[:theme_color_text]),
      hero_url: InstancePresenter.new.hero&.file&.url
    ).to_css

    render layout: false
  end

  private

  def sanitized_color(value)
    value.to_s.match?(Form::AdminSettings::HEX_COLOR_FORMAT) ? value : nil
  end

  def after_update_redirect_path
    admin_settings_appearance_path
  end
end
