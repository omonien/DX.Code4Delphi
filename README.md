# Delphi — High Quality Language Support for Visual Studio Code

Modern, high-quality **Delphi / Object Pascal** language support for Visual Studio Code, covering the latest Delphi language features (through **Delphi 13.1** and all older versions back to Delphi 7), plus the code-navigation shortcuts Delphi developers expect from the RAD Studio IDE.

## Features

### 1. High-quality syntax highlighting

A carefully written TextMate grammar (`source.delphi`) that distinguishes:

| What | Example scopes |
| --- | --- |
| Method declarations & implementations | `storage.type.function`, `entity.name.function` |
| Class / record / interface / helper names | `entity.name.type` |
| Built-in types (case-insensitive) | `support.type.primitive` (`Integer`, `string`, `TObject`, …) |
| RTL functions | `support.function.builtin` (`Length`, `SetLength`, `Format`, …) |
| Keywords, sections & control flow | `keyword.control.section`, `keyword.control`, `keyword.control.exception` |
| Modifiers & calling conventions | `storage.modifier` (`virtual`, `override`, `cdecl`, `deprecated`, `weak`, …) |
| Compiler directives | `meta.preprocessor` (`{$IFDEF}`, `{$REGION}`, …) |
| Attributes | `meta.attribute`, `entity.other.attribute-name` (`[ComponentName(1)]`) |
| Comments (all 3 styles) | `comment.line`, `comment.block`, `comment.block.pascal` |
| Strings (incl. multi-line `'''…'''` literals) & char codes | `string.quoted.*`, `constant.character.numeric` |
| Numbers (dec / hex `$` / binary `%`, underscores) | `constant.numeric.*` |
| Generics type parameters | `entity.name.type` (`TList<T>`) |
| Operators, range `..`, assignment `:=` | `keyword.operator.*` |

Language features covered for Delphi **13.1 / 12 / 11 / 10.4** and older:
* Class / interface / record / **record & class helpers** / legacy `object`
* Generics with constraints, **anonymous methods** (`reference to`), nested types
* **Inline `var`** (function & block scope), managed records (`class operator Initialize/Finalize/Assign/AddRef/Copy`)
* `weak` / `unsafe` references, **multi-line string literals** (`'''…'''`)
* Attributes, operator overloading (`implicit`, `explicit`, `Add`, …)
* `strict private/protected`, `sealed`, `static`, `abstract`, `final`, `message` handlers
* All calling conventions (`register`, `cdecl`, `stdcall`, `safecall`, `pascal`, `fastcall`, `winapi`)
* Compiler directives & predefined conditionals (`IFDEF`, `REGION`, `VER400`, `WIN64`, …)
* Unit, program, library & package files (`.pas`, `.pp`, `.dpr`, `.dpk`, `.inc`, `.p`, `.int`)

### 2. Delphi-IDE style code navigation

| Shortcut | Command | What it does |
| --- | --- | --- |
| `Ctrl+Shift+Down` (also `Ctrl+Alt+Down`) | **Delphi: Go to Method Implementation / Interface Section** | On a method declaration → jumps to its implementation; on an implementation → back to the declaration; otherwise toggles between the `interface` and `implementation` section |
| `Ctrl+Shift+Up` (also `Ctrl+Alt+Up`) | **Delphi: Go to Method Declaration / Implementation Section** | The inverse navigation |
| `Alt+Down` | **Delphi: Next Method** | Jump to the next method (declaration or implementation) |
| `Alt+Up` | **Delphi: Previous Method** | Jump to the previous method |

Navigation is **overload-aware**: when a class declares several overloads of the same method, parameter types are compared so you land on the *correct* implementation (and back). It understands:
* class methods (`procedure TMyClass.Foo`) and plain global routines
* generic methods & generic classes (`procedure TMyGeneric<T>.AddItem`)
* class operators, constructors, destructors, `class function`/`class procedure`
* multi-line parameter lists
* nested local routines are correctly ignored (only top-level routines are navigated)

### 3. Code folding

A folding provider creates fold regions for `interface` / `implementation` / `initialization` / `finalization` sections and for `begin…end`, `case`, `try`, `record` and `class` blocks. `{$REGION}` / `{$ENDREGION}` markers are honored too.

### 4. Editor conveniences

* Comment toggling for `//` and `{ }`
* Auto-closing pairs for `()`, `[]`, `{}`, strings and multi-line strings
* Proper word boundaries (`TMyClass_123` selects as one word)

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
| `delphi.folding.sections` | `true` | Fold the four unit sections. |
| `delphi.folding.beginEnd` | `true` | Fold `begin…end` style blocks. |

To change a shortcut, use `Preferences → Keyboard Shortcuts` and rebind `Delphi: Go to Method Implementation / Interface Section`, etc. (or edit `keybindings.json`).

## Requirements

* Visual Studio Code **1.80 or newer**. No runtime dependencies; works offline.

## Known limitations

* Syntax highlighting is a TextMate grammar, so it is purely lexical (no semantic type resolution) — like every other non-LSP Delphi extension.
* Interface ↔ implementation matching is heuristic and line-based; extremely unusual formatting (e.g. `procedure` on a different line than the method name) may not be recognised.
* `.dfm` form files and XML `.dproj` files are not treated as Delphi code (they have their own formats).

## Development

```sh
npm install          # only needed for tests (vscode-textmate + vscode-oniguruma)
npm test             # runs 49 unit tests: parser/navigation + grammar tokenizer + commands + activation
```

Press `F5` in VS Code to launch the Extension Development Host.

## License

MIT — see [LICENSE](LICENSE).
