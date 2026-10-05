# Regenerating media/banner.png

Source files:

- `media/banner.svg` — vector layout (title, subtitle, footer, placement)
- `media/banner-icon.png` — Delphi helmet circle taken from the original banner

The PNG is rendered at 1024x256 with Inter Bold 48 for the title
`DX.Code4Delphi`, subtitle unchanged, footer
`by Developer Experts, LLC  ·  www.developer-experts.net` (middle dot, no dash).

Re-render with a Chromium-based tool that loads Inter, using the same
geometry as `media/banner.svg`, then overwrite `media/banner.png`.
