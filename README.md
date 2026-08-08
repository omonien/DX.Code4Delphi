# Code4Delphi — Delphi Language Support for Visual Studio Code

<p align="center">
  <img src="media/banner.png" alt="Code4Delphi by Developer Experts" width="640">
</p>

**Code4Delphi** by **[Developer Experts, LLC](https://www.developer-experts.net)** — Modern, high-quality **Delphi / Object Pascal** language support for Visual Studio Code, covering the latest Delphi language features (through **Delphi 13.1** and all older versions back to Delphi 7), plus the code-navigation shortcuts Delphi developers expect from the RAD Studio IDE.

## Quick Info

**Syntax Highlighting** & **Familiar Keybindings** for **Delphi in Visual Studio Code** — out of the box:

| | |
| --- | --- |
| 🎨 **Syntax Highlighting** | Modern, high-quality **Delphi 13.1** syntax highlighting — all latest language features plus full support for older Delphi code, in `.pas`, `.pp`, `.dpr`, `.dpk`, `.inc`, `.p` and `.int` files. |
| ⌨️ **Familiar Keybindings** | The **Delphi IDE shortcuts you already know**: `Ctrl+Shift+↓` / `Ctrl+Alt+↓` → interface ↔ implementation, `Ctrl+Shift+↑` / `Ctrl+Alt+↑` → back to declaration, `Alt+↓` / `Alt+↑` → next / previous method. |

## Why Code4Delphi?

There are other Delphi extensions for Visual Studio Code — some of them are very
powerful, but they often bundle **complex additional features**: language servers,
project & build tooling, completion engines, dependency analyzers and more. That
is great when you need all of it — and heavy when you don't.

**Code4Delphi is deliberately lightweight:**

* 🎨 just excellent **syntax highlighting** and
* ⌨️ the **familiar Delphi keybindings** for fast code navigation —
* 🪶 **no Language Server (LSP)**, no build integration, no telemetry, **zero
  runtime dependencies**.

Instead of a language server — a separate process with its own runtime and
dependencies — Code4Delphi uses a **small, built-in static analyser** that runs
directly in the extension host. It is purely syntax-based (lexical) and needs
**no external components**: nothing to download, no server to start, no extra
memory beyond the document itself. That keeps the extension small, fast to
install, and instant to activate.

It activates instantly and stays out of your way — the ideal companion when you
want to **read, review and inspect Delphi code**, for example code written by
**Claude or other AI agents**.

## Features

Code4Delphi brings the features Delphi developers know from the RAD Studio IDE
into Visual Studio Code:

1. **High-quality syntax highlighting** — a hand-crafted TextMate grammar that
   covers the complete **Delphi 13.1** language and every older version. Unit
   sections, class/record/interface declarations, generics, attributes,
   operator overloading, managed records and multi-line string literals are all
   colored precisely — in any theme.

2. **Delphi-IDE code navigation** — jump from an `interface` method declaration
   to its `implementation` (`Ctrl+Shift+↓`), back with `Ctrl+Shift+↑`, and step
   through methods with `Alt+↓` / `Alt+↑`. Navigation is **overload-aware**
   (parameter types are compared, so you always land on the right method) and
   understands classes, records, helpers, generics and global routines.

3. **Selectable color schemes** — four syntax schemes for Delphi code:
   **Fancy** (the vivid Code4Delphi look), **Turbo Pascal** (the classic IDE)
   and the authentic **Delphi Light** / **Delphi Dark** colors of Delphi 13.1.
   The default **`auto`** follows your VS Code light/dark theme. Only the
   Delphi highlighting changes — your global theme is never touched.

4. **Code folding** — fold unit sections (`interface`, `implementation`, …) and
   `begin…end`, `case`, `try`, `record` and `class` blocks; `{$REGION}` /
   `{$ENDREGION}` markers work, too.

5. **Editor conveniences** — comment toggling for `//` and `{ }`, auto-closing
   brackets and strings (incl. multi-line `'''…'''` literals), and correct
   word selection for identifiers like `TMyClass_123`.

6. **Form layout visualizer** — box-model view of `.dfm` / `.fmx` with Align simulation (see below).

### 5. Editor conveniences

* Comment toggling for `//` and `{ }`
* Auto-closing pairs for `()`, `[]`, `{}`, strings and multi-line strings
* Proper word boundaries (`TMyClass_123` selects as one word)

### 6. Form layout visualizer (DFM / FMX)

Open any `.dfm` or `.fmx` file (or a `.pas` that has a sibling form) and run **Code4Delphi: Show Form Layout**.

A side-by-side webview draws the form as a **box model**:

* Every control becomes a rectangle using its stored `Left` / `Top` / `Width` / `Height` (or FMX `Position` / `Size`).
* Nested hierarchy is preserved; children are drawn inside their parent.
* Click a box → it is highlighted; all of its descendants are highlighted in a different style so you can see the ownership tree at a glance.
* Double-click jumps back to the corresponding `object` line in the text editor.

**Align simulation.** The visualizer does not only show the raw coordinates written in the file. It runs a lightweight layout pass that approximates Delphi’s Align behaviour:

| Framework | Behaviour |
| --- | --- |
| **VCL** (`.dfm`) | `alTop` / `alBottom` / `alLeft` / `alRight` stack along the edges; `alClient` fills the remaining client area. |
| **FMX** (`.fmx`) | Same edge rules, plus `MostTop` / `MostBottom` / `MostLeft` / `MostRight` (higher priority), `Contents` (fills the whole parent and overlaps), `Center` / `VertCenter` / `HorzCenter` / `Horizontal` / `Vertical`. `Scale` / `Fit*` are approximated as Client. |

Align is normalised (`alTop` → `Top`, etc.) and shown in the box label when it is not `None` (e.g. `StatusBar1 [Bottom]`).

The renderer is **pluggable**: the current implementation is DOM-based (nested absolutely positioned divs). The architecture (`IRenderProvider`) is designed so a Canvas or SVG provider can be added later without touching the parser or the view host.

## Configuration

Everything is configurable through settings (`Preferences → Settings → Extensions → Delphi`):

| Setting | Default | Description |
| --- | --- | --- |
| `delphi.navigation.enabled` | `true` | Master switch for all navigation keybindings. Turn it off to free the shortcuts for other extensions. |
| `delphi.navigation.goToImplementation` | `true` | Enable the “Go to Method Implementation” command and its shortcuts. |
| `delphi.navigation.goToDeclaration` | `true` | Enable the “Go to Method Declaration” command and its shortcuts. |
| `delphi.navigation.nextPreviousMethod` | `true` | Enable “Next/Previous Method” commands and their shortcuts. |
| `delphi.navigation.matchOverloads` | `true` | Use parameter types to disambiguate overloads when jumping. |
| `delphi.navigation.jumpToSection` | `true` | When the cursor is not on a method, jump between the `interface`/`implementation` section headers. |
| `delphi.navigation.showStatusMessage` | `false` | Show status-bar feedback on navigation. |
| `delphi.keybindings.style` | `default` | Keybinding style for the navigation commands: `default`, `emacs` or `wordstar`. |
| `delphi.colorScheme` | `auto` | Syntax color scheme for Delphi files only (global theme untouched): `auto` (follows your light/dark theme), `fancy`, `turboPascal`, `delphiDark`, `delphiLight` or `none`. |
| `delphi.folding.sections` | `true` | Fold the four unit sections. |
| `delphi.folding.beginEnd` | `true` | Fold `begin…end` style blocks. |

To change a shortcut, use `Preferences → Keyboard Shortcuts` and rebind `Delphi: Go to Method Implementation / Interface Section`, etc. (or edit `keybindings.json`).

## Requirements

* Visual Studio Code **1.80 or newer**. No runtime dependencies; works offline.

## Known limitations

* Syntax highlighting is a TextMate grammar, so it is purely lexical (no semantic type resolution) — like every other non-LSP Delphi extension.
* Interface ↔ implementation matching is heuristic and line-based; extremely unusual formatting (e.g. `procedure` on a different line than the method name) may not be recognised.
* Form layout visualizer:
  * Text DFM/FMX only (binary forms are not parsed).
  * Align simulation covers the common edge + Client cases well; it does **not** implement full FMX layout managers, per-control Margins/Padding, CustomAlign callbacks, or exact Fit/Scale aspect-ratio math.
  * Non-visual components without size are omitted from the drawing (they still appear in the tree for hierarchy).

## Development

```sh
npm install          # only needed for tests (vscode-textmate + vscode-oniguruma)
npm test             # unit tests: parser/navigation + grammar + form layout + commands + activation
npm run test:formLayout   # only the DFM/FMX parser + Align layout engine
```

Press `F5` in VS Code to launch the Extension Development Host.

Marketplace publishing (publisher `DeveloperExperts`, PAT expiry, `vsce` commands) is documented in [`docs/publishing.md`](docs/publishing.md).

## License

MIT — see [LICENSE](LICENSE).
