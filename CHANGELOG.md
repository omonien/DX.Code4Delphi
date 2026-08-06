# Changelog

All notable changes to **Code4Delphi** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.4] — 2026-08-07

### Changed

- **Repository URL** updated to the public GitHub repo
  [`omonien/DX.Code4Delphi`](https://github.com/omonien/DX.Code4Delphi)
  (renamed from `DX.Code4DelphiX`; Marketplace README images resolve again).

## [1.3.3] — 2026-08-06

### Fixed

- **Navigation: forward `class;` / `class of` no longer steal ownership** of later
  global routines (interface `className` stayed stuck on the forward type).
- **Navigation: multi-name parameter groups** (`A, B: Integer`) expand to one
  type per formal so overloads match implementations written as
  `A: Integer; B: Integer`.
- **Navigation: overload matching is exact** when `matchOverloads` is on — no
  silent fallback to the first same-named candidate.
- **Navigation: indented `begin`** after a method header no longer suppresses
  every subsequent implementation method.
- **Navigation: `type T = class` on one line** correctly owns nested methods.
- **Navigation: `methodAtPosition`** respects the signature end column.
- **Activation** no longer runs on every VS Code start (`onStartupFinished`
  removed) — the extension activates for Delphi files and its commands.
- **Color scheme apply** skips writing `editor.tokenColorCustomizations` when
  the rules are already correct (less `settings.json` thrash).
- **Commands** are always registered; nav feature flags are checked at
  invocation time (no reload needed after toggling settings).
- Marketplace categories no longer claim Formatters/Snippets.
- **Multiple nested locals** before an outer `begin` stay unindexed (indented-begin fix no longer mis-classifies a second local as a top-level method).
- **Untyped formals** (`const Source; var Dest`) keep arity for overload matching.
- Analyze cache keys only on `document.version` (no `getText()` on hits).

## [1.3.2] — 2025-08-04

### Changed

- **Logo without frame**: the extension icon (and `media/logo-512.png`) now
  shows the Delphi helm on a **transparent background** — no dark tile around
  it, matching how most other extensions display their logo.
- **README**: detailed, explained feature overview added at the top of the
  Features section (syntax highlighting, navigation, color schemes, folding,
  editor conveniences); fixed section numbering.

## [1.3.1] — 2025-08-04

### Fixed

- **Delphi Light/Dark schemes now match the real Delphi 13.1 default colors**
  (measured from reference screenshots of the fixture units in the Delphi IDE):
  - Light: bold navy keywords (`#000C7A`), **purple** strings (`#741F7B`),
    bright-blue numbers (`#0024F4`), green comments (`#3A7C27`), black
    types/identifiers.
  - Dark: bold cream keywords (`#FAE0BF`), light-blue strings (`#86A9F8`),
    light-pink numbers (`#EE85A8`), light-green comments (`#C3E48E`),
    off-white types/identifiers.
  The previous yellow-ish string color was a misreading of the screenshot.

## [1.3.0] — 2025-08-04

### Added

- **`delphi.colorScheme` default is now `auto`**: the extension detects the
  user's active VS Code theme kind (dark/light via `window.activeColorTheme`)
  and applies *Delphi Dark* or *Delphi Light* accordingly — and follows
  automatically when the theme is switched.

### Fixed

- Delphi Light/Dark schemes: **keywords** (`procedure`, `property`, `class`,
  `private`, …) are now **bold** like in the Delphi 13.1 IDE; **property names
  are no longer bold**.

## [1.2.0] — 2025-08-04

### Changed

- **Color schemes are now syntax-only**: `delphi.colorScheme` applies the
  selected scheme via `editor.tokenColorCustomizations` with exclusively
  `*.delphi`-scoped rules — only the Delphi highlighting changes, the global
  VS Code theme and other languages are untouched. The full-theme
  contributions were removed. Schemes can also be chosen via
  `Code4Delphi: Select Color Scheme`.
- Settings group renamed from "Delphi" to **"Code4Delphi"**; all commands now
  use the `Code4Delphi` category.
- Added **`Code4Delphi: Select Keybinding Style`** command (Quick Pick) so the
  keybinding styles are always reachable, alongside the `delphi.keybindings.style`
  setting.

## [1.1.0] — 2025-08-04

### Added

- **Selectable color schemes** (`delphi.colorScheme`): `Code4Delphi Fancy`,
  `Code4Delphi Turbo Pascal`, `Code4Delphi Delphi Dark` and
  `Code4Delphi Delphi Light` — four full VS Code themes that are activated
  automatically from the setting and also appear in the theme picker.
- **Keybinding styles** (`delphi.keybindings.style`): `default`, `emacs` and
  `wordstar` variants of the navigation shortcuts, switched via setting.
- README: "Why Code4Delphi?" motivation section (lightweight, no LSP — built-in
  static analysis, zero runtime dependencies).

## [1.0.0] — 2025-08-04

### Added — Initial Release

- **Syntax highlighting** for Delphi / Object Pascal (`.pas`, `.pp`, `.dpr`, `.dpk`, `.inc`, `.p`, `.int`)
  via a high-quality TextMate grammar covering the latest Delphi 13.1 language features and all older versions.
- **Familiar Delphi IDE keybindings** for code navigation:
  `Ctrl+Shift+Up/Down` & `Ctrl+Alt+Up/Down` (interface ↔ implementation),
  `Alt+Up/Down` (next / previous method) — with overload-aware matching.
- **Code folding** for unit sections and `begin…end` blocks, incl. `{$REGION}` support.
- **Language configuration**: comment toggling, auto-closing pairs, word patterns.
- **Fully configurable** via `delphi.*` settings; every keybinding can be re-bound or disabled.
- 50 automated tests covering parser, navigation, grammar tokenization, commands and activation.

[1.0.0]: https://github.com/omonien/DX.Code4Delphi/releases/tag/v1.0.0
[1.1.0]: https://github.com/omonien/DX.Code4Delphi/releases/tag/v1.1.0
[1.2.0]: https://github.com/omonien/DX.Code4Delphi/releases/tag/v1.2.0
[1.3.0]: https://github.com/omonien/DX.Code4Delphi/releases/tag/v1.3.0
[1.3.1]: https://github.com/omonien/DX.Code4Delphi/releases/tag/v1.3.1
[1.3.2]: https://github.com/omonien/DX.Code4Delphi/releases/tag/v1.3.2
[1.3.3]: https://github.com/omonien/DX.Code4Delphi/releases/tag/v1.3.3
[1.3.4]: https://github.com/omonien/DX.Code4Delphi/releases/tag/v1.3.4
