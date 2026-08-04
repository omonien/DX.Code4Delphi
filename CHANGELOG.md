# Changelog

All notable changes to **Code4Delphi** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
