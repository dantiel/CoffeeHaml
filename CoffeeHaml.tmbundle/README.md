# CoffeeHaml TextMate Bundle

**CoffeeHaml — Haml structure, CoffeeScript semantics, React runtime.**

Syntax highlighting, formatting (Prettier), compilation, and project scaffolding for `.chaml` files in TextMate.

## Installation

```bash
# Symlink into TextMate bundles (macOS)
ln -sfn "$(pwd)/CoffeeHaml.tmbundle" \
  ~/"Library/Application Support/TextMate/Bundles/CoffeeHaml.tmbundle"

# Then: Bundles → Bundle Editor → Reload Bundles
```

Or use the bundled install command:
```bash
rsync -a CoffeeHaml.tmbundle/ \
  ~/"Library/Application Support/TextMate/Bundles/CoffeeHaml.tmbundle/"
```

**Prerequisites**: The Format command (`⌃⌥F`) and Compile commands require a project-local `npm install` with `coffeehaml` and `prettier` in `node_modules`.

## Commands

| Key | Command | Description |
|-----|---------|-------------|
| **⌃⌥F** | Format Document | Prettier format stdin → replaces document. Resolves `coffeehaml` + `prettier` from project `node_modules`. |
| **⌃⌘B** | Compile to JSX | `coffeehaml compile` → `.jsx` file. HTML output window with result or errors. |
| **⌃⌘P** | Compile & Preview JSX | Compiles to stdout, renders as syntax-colored HTML. |
| — | Compile & Copy to Clipboard | Compiles → `pbcopy`. Tooltip shows line count. |
| **⌃⌥I** | Init Project | Opens Terminal, runs `coffeehaml init` in project root. |

## Snippets

| Trigger | Expands to |
|---------|------------|
| `cdiv` | `%div{ className: true }\n  = "Hello"` |
| `cif` | `- if condition\n  %div "yes"\n- else\n  %div "no"` |
| `cfor` | `- for item in items\n  %div{ key: item.id }\n    = item.name` |

## Preferences

- **2-space soft tabs** for `.chaml` files
- **Symbol list**: `%tagname`, `.class`, `#id`, `- if/for/while`, `= output`

## File Map

```
CoffeeHaml.tmbundle/
├── info.plist                  # Bundle metadata
├── Commands/                   # ⌃-key actions
│   ├── Format Document.tmCommand
│   ├── Compile to JSX.tmCommand
│   ├── Compile and Preview JSX.tmCommand
│   ├── Compile and Copy to Clipboard.tmCommand
│   └── Init Project.tmCommand
├── Snippets/                   # Tab-trigger snippets
│   ├── Div with attrs.tmSnippet
│   ├── if-else.tmSnippet
│   └── for-loop.tmSnippet
├── Syntaxes/                   # Duplicate of repo root `syntaxes/`
│   ├── CoffeeHaml.tmLanguage
│   └── coffeehaml.tmLanguage.json
└── Preferences/
    ├── Indentation.tmPreferences
    └── Symbol List.tmPreferences
```

> **Note**: `Syntaxes/` is a copy of the repo root `syntaxes/` directory. The root copy serves VS Code (`package.json` contributions); the bundle copy enables TextMate offline usage. Keep both in sync.
