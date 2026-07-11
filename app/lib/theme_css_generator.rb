# frozen_string_literal: true

# Builds a small CSS override sheet from the handful of brand colors an admin
# picks in the appearance settings. It only redefines a few top-level semantic
# theme tokens (defined in app/javascript/styles/mastodon/theme/_dark.scss and
# _light.scss); everything else cascades from those through the existing token
# mapping. Derived shades are left to CSS `color-mix`, matching how the stock
# theme derives its own soft/hover variants.
class ThemeCssGenerator
  # Selectors mirror app/javascript/styles/mastodon/theme/index.scss so the
  # generated rules match the theme pack's specificity and, being loaded after
  # it, win the cascade.
  DARK_SELECTOR = "[data-color-scheme='dark'], html:not([data-color-scheme])"
  LIGHT_SELECTOR = "[data-color-scheme='light']"

  def initialize(brand: nil, background: nil, background_secondary: nil, text: nil, hero_url: nil)
    @brand = brand.presence
    @background = background.presence
    @background_secondary = background_secondary.presence
    @text = text.presence
    @hero_url = hero_url.presence
  end

  def to_css
    blocks = [dark_block, light_block, hero_block].compact
    blocks.join("\n\n")
  end

  private

  # The default color scheme. Brand, background and text are all applied here.
  def dark_block
    declarations = brand_declarations(text_brand_tint: 'var(--color-white) 30%')
    declarations += background_declarations
    declarations += text_declarations
    wrap(DARK_SELECTOR, declarations)
  end

  # Light scheme only gets re-branded; background/text stay at their legible
  # defaults so a dark brand background does not break light mode.
  def light_block
    wrap(LIGHT_SELECTOR, brand_declarations(text_brand_tint: 'var(--color-black) 20%'))
  end

  # +text_brand_tint+ is the second operand of a color-mix used to keep the
  # brand text legible against each scheme's background.
  def brand_declarations(text_brand_tint:)
    return [] if @brand.blank?

    [
      "--color-bg-brand-base: #{@brand};",
      "--color-bg-brand-base-hover: color-mix(in oklab, #{@brand}, var(--color-black) 12%);",
      "--color-bg-brand-soft: color-mix(in oklab, #{@brand}, var(--color-bg-primary) 78%);",
      "--color-bg-brand-softest: color-mix(in oklab, #{@brand}, var(--color-bg-primary) 88%);",
      "--color-text-brand: color-mix(in oklab, #{@brand}, #{text_brand_tint});",
    ]
  end

  def background_declarations
    declarations = []
    declarations << "--color-bg-primary: #{@background};" if @background.present?
    declarations << "--color-bg-secondary: #{@background_secondary};" if @background_secondary.present?
    declarations
  end

  def text_declarations
    return [] if @text.blank?

    [
      "--color-text-primary: #{@text};",
      "--color-text-secondary: color-mix(in oklab, #{@text}, var(--color-bg-primary) 35%);",
    ]
  end

  def hero_block
    return if @hero_url.blank?

    <<~CSS.strip
      .public-layout,
      .app-holder--login {
        background-image: url(#{@hero_url});
        background-size: cover;
        background-position: center;
        background-attachment: fixed;
      }
    CSS
  end

  def wrap(selector, declarations)
    return if declarations.empty?

    "#{selector} {\n  #{declarations.join("\n  ")}\n}"
  end
end
