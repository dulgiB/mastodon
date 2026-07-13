# frozen_string_literal: true

Rails.application.config.to_prepare do
  digested_settings = begin
    { custom_css: Setting.custom_css, theme_custom_css: Setting.theme_custom_css }
  rescue # Running without a cache, database, not migrated, no connection, etc
    {}
  end

  digested_settings.each do |key, value|
    next if value.blank?

    Rails
      .cache
      .write(
        :"setting_digest_#{key}",
        Digest::SHA256.hexdigest(value)
      )
  end
end
