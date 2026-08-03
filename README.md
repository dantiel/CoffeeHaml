# ☕ CoffeeHaml

> **Haml structure. CoffeeScript semantics. React runtime.**

CoffeeHaml is a compiler that transforms an indentation-based, Haml-inspired
authoring language into JavaScript using the modern React JSX runtime
(`react/jsx-runtime`). It is **not** a UI framework. React remains the runtime.
CoffeeHaml replaces JSX — with 50% fewer tokens.

```haml
%SimulatorPanel{source: "gyro", width: "auto", height: 500}
  - for servo in servos
    %ServoGraph{channel: servo.channel}
    %ServoPanel{servo: servo}

  %Button{onClick: save, disabled: !connected}
    Save
```

↓ compiles to ↓

```js
import { jsxs, jsx, Fragment } from "react/jsx-runtime";

jsxs(SimulatorPanel, { source: "gyro", width: "auto", height: 500 },
  ...servos.map(servo => jsxs(Fragment, {},
    jsx(ServoGraph, { channel: servo.channel }),
    jsx(ServoPanel, { servo: servo })
  )),
  jsx(Button, { onClick: save, disabled: !connected }, "Save")
);
```

---

## Why

| JSX | CoffeeHaml |
|-----|------------|
| `<div className="box"><h1>Hello</h1><p>World</p></div>` | `%div.box%h1 Hello%p World` |
| Closing tags echo the opener verbatim | Indentation *is* structure |
| 17 structural tokens | 8 structural tokens |
| Angle brackets, braces, delimiters everywhere | Only semantic characters |

Every character carries weight. No syntactic ceremony — only meaning.

### The Indentation Renaissance

Modern LLMs are increasingly trained on indentation-based languages — Python,
YAML, Haml, Sass. Their tokenizers have internalized significant whitespace as
structural signal. CoffeeHaml enters this cycle at precisely the right moment:
the community is ready for a leap in expressiveness that *removes* boilerplate
rather than adding another layer of abstraction.

---

## Install

```bash
npm install coffeehaml
```

> **GitHub:** [dantiel/CoffeeHaml](https://github.com/dantiel/CoffeeHaml)

CoffeeScript is an optional peer dependency — install it to compile CoffeeScript
expressions in attributes and control flow:

```bash
npm install coffeescript
```

Without CoffeeScript, expressions pass through as-is (valid for most JS
expressions like `{onClick: handler}` or `{disabled: !connected}`).

---

## Usage

### CLI

```bash
npx coffeehaml compile app.coffeehaml
```

Accepts `.coffeehaml`, `.cohaml`, and `.chaml` extensions.

### Vite plugin

```ts
// vite.config.ts
import coffeehaml from 'coffeehaml/vite';

export default {
  plugins: [coffeehaml()],
};
```

Now import `.chaml` files directly — they compile to React components with HMR.

### Node API

```ts
import { compile, compileFile } from 'coffeehaml';

const result = compile('%div Hello', { filename: 'app.chaml' });
console.log(result.code);
// → import { jsx } from "react/jsx-runtime";
//   jsx("div", null, "Hello");
```

---

## Syntax

| CoffeeHaml | Description |
|------------|-------------|
| `%tag` | HTML element (`%div`, `%span`, `%button`) |
| `%Component` | React component (uppercase) |
| `.class` | CSS class |
| `#id` | Element ID |
| `{attr: val}` / `(attr: val)` | Attributes (CoffeeScript expressions) |
| `{onClick}` | Shorthand — `onClick={onClick}` |
| `= expression` | Inline output (escaped) |
| `- if`, `- unless` | Conditional |
| `- for x in xs` | Loop → `.map()` |
| `- else`, `- else if` | Chain conditionals |
| `-# comment` | Haml comment (stripped) |
| `/ comment` | HTML comment |
| `.wrapper` | Implicit div |

Full grammar: [`docs/grammar.md`](docs/grammar.md)

---

## Design Principles

- **Zero runtime** — the compiler is the only artifact
- **Emitter-agnostic AST** — future backends possible (Solid, Vue, Mithril)
- **Excellent source maps** — debug in CoffeeHaml, not generated JS
- **Incremental compilation** — Vite HMR out of the box
- **No invention** — reuse Haml and CoffeeScript conventions

---

## Status

**v0.1.0 — experimental.** The core compiler pipeline (Lexer → Parser →
Emitter) is functional. Source maps and CoffeeScript expression compilation
require the `coffeescript` peer dependency.

| Feature | Status |
|---------|--------|
| Elements, components, implicit divs | ✅ |
| `.class` / `#id` modifiers | ✅ |
| `{attr: val}` / `(attr: val)` blocks | ✅ |
| Inline `= expression` output | ✅ |
| `- if` / `- unless` / `- else` / `- else if` | ✅ |
| `- for item in items` → `.map()` | ✅ |
| `- while` | ✅ |
| Haml/HTML comments | ✅ |
| `:filter` blocks | ✅ |
| Vite plugin with HMR | ✅ |
| Source maps | 🚧 Stubbed |
| CoffeeScript expression compilation | 🚧 Requires peer dep |
| React Fast Refresh | 📅 Planned |

---

## License

MIT

---

*Haml structure. CoffeeScript semantics. React runtime. Nothing more, nothing less.*