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

  # Contexts that render a "light" wordmark: the light color scheme plus the
  # legacy fixed-appearance light theme bundles (theme-ui/bird-ui/mastodon-light
  # pick their look from a body theme class rather than [data-color-scheme]).
  LIGHT_WORDMARK_SELECTORS = [
    "[data-color-scheme='light']",
    'body.theme-default',
    'body.theme-bird-ui-light',
    'body.theme-mastodon-light',
  ].freeze

  def initialize(brand: nil, background: nil, background_secondary: nil, text: nil, hero_url: nil, wordmark_light_url: nil, wordmark_dark_url: nil)
    @brand = brand.presence
    @background = background.presence
    @background_secondary = background_secondary.presence
    @text = text.presence
    @hero_url = hero_url.presence
    @wordmark_light_url = wordmark_light_url.presence
    @wordmark_dark_url = wordmark_dark_url.presence
  end

  def to_css
    blocks = [dark_block, light_block, hero_block, wordmark_block].compact
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
      .app-holder {
        background-image: url(#{@hero_url});
        background-size: cover;
        background-position: center;
        background-attachment: fixed;
      }
    CSS
  end

  # Overrides the sidebar wordmark across every theme. theme-ui/bird-ui render it
  # as a `background-image: var(--logo)`, stock/token themes as an <img> we swap
  # with `content`. A single --admin-wordmark var carries the per-scheme choice.
  # An unset variant falls back to the other so uploading one still shows a logo.
  #
  # --logo is redefined by theme-ui/bird-ui directly on `body` (e.g.
  # `body.theme-default.layout-single-column`), not just `:root`. Custom
  # properties don't let `!important` beat a value that's directly cascaded on
  # the element itself (inheritance from `:root` only wins when the element has
  # no own declaration), so the override has to target `html, body` -- matching
  # or outranking every place a theme pack redeclares --logo -- rather than
  # `:root` alone.
  def wordmark_block
    return if @wordmark_dark_url.blank? && @wordmark_light_url.blank?

    dark_url = @wordmark_dark_url || @wordmark_light_url
    light_url = @wordmark_light_url || @wordmark_dark_url

    <<~CSS.strip
      html, body {
        --admin-wordmark: url(#{dark_url});
        --logo: var(--admin-wordmark) !important;
      }

      #{LIGHT_WORDMARK_SELECTORS.join(",\n")} {
        --admin-wordmark: url(#{light_url});
      }

      img.logo--wordmark {
        content: var(--admin-wordmark) !important;
      }
    CSS
  end

  def wrap(selector, declarations)
    return if declarations.empty?

    "#{selector} {\n  #{declarations.join("\n  ")}\n}"
  end
end
