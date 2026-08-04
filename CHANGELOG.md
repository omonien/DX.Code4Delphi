# Changelog

All notable changes to **Code4Delphi** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/omonien/DX.Code4DelphiX/releases/tag/v1.0.0
[1.1.0]: https://github.com/omonien/DX.Code4DelphiX/releases/tag/v1.1.0
