# CoffeeHaml

> *Haml structure. CoffeeScript semantics. React runtime.*

CoffeeHaml is a compiler that transforms an indentation-based, Haml-inspired
authoring language into JavaScript using the modern React JSX runtime
(`react/jsx-runtime`).

It is **not** a UI framework. React remains the runtime. CoffeeHaml replaces JSX.

---

## Philosophy

| Concern | Approach |
|---------|----------|
| **Structure** | Haml — significant indentation, `%tag`, `.class`, `#id` |
| **Semantics** | CoffeeScript — expression-oriented, `->`, `for...in`, implicit return |
| **Runtime** | React — `jsx()` / `jsxs()` calls, zero CoffeeHaml runtime |
| **Output** | JavaScript (ES2020+) with `react/jsx-runtime` imports |

## Five-Second Glimpse

```haml
%SimulatorPanel{source: "gyro", width: "auto", height: 500}
  - for servo in servos
    %ServoGraph{channel: servo.channel}
    %ServoPanel{servo: servo}

  %Button{onClick: save, disabled: !connected}
    Save
```

Compiles to:

```js
import { jsxs, jsx } from "react/jsx-runtime";
jsxs(SimulatorPanel, { source: "gyro", width: "auto", height: 500 },
  ...servos.map(servo => jsxs(Fragment, {},
    jsx(ServoGraph, { channel: servo.channel }),
    jsx(ServoPanel, { servo })
  )),
  jsx(Button, { onClick: save, disabled: !connected }, "Save")
);
```

## Design Constraints

- **Maximum compatibility with Haml** — existing muscle memory transfers
- **CoffeeScript expression syntax** — not Ruby, not JSX
- **Token-efficient** — fewer characters than JSX for equivalent output
- **No invention** — reuse Haml and CoffeeScript conventions
- **Zero runtime** — the compiler is the only artifact
- **Excellent source maps** — debug in CoffeeHaml, not generated JS
- **Incremental compilation** — Vite plugin with HMR support
- **Emitter-agnostic AST** — future backends (Solid, Vue, Mithril) possible

## Token Efficiency & The Indentation Renaissance

CoffeeHaml is designed at the dawn of a shift in how code is generated. Modern
LLMs are increasingly trained on indentation-based languages — Python, YAML,
Haml, Sass, Stylus — and their tokenizers have internalized significant
whitespace as structural signal. Where JSX wastes tokens on `<`, `</`, `>`, `/>`,
`{`, `}`, and closing tags that echo the opening tag name verbatim, CoffeeHaml
lets the indentation *be* the structure. No closing tags. No angle brackets.
No delimiter pairs that must be matched.

### Token count comparison (equivalent output)

| Syntax | Tokens |
|--------|--------|
| `<div className="box"><h1>Hello</h1><p>World</p></div>` | 17 |
| `%div.box%h1 Hello%p World` | 8 |
| **50%+ reduction** in structural tokens | |

Every character in CoffeeHaml carries semantic weight. There are no syntactic
ceremonies — only meaning. This is not merely an aesthetic preference; in an era
where LLMs both consume and produce code, token efficiency directly impacts
context window utilization, inference cost, and generation speed.

### The LLM training flywheel

Indentation-based languages create a virtuous cycle:

1. **LLMs are trained on them** → tokenizers learn to treat indentation as
   structural, not ornamental
2. **LLMs generate them** → more indentation-based code enters the training
   corpus
3. **Tooling improves** → better completions, lower error rates, tighter
   feedback loops

CoffeeHaml enters this cycle at precisely the right moment. React developers
have been writing JSX for a decade — the community is ready for a leap in
expressiveness that removes boilerplate rather than adding it.

### Why not just use Haml with Ruby?

Because React is JavaScript. Bridging Ruby semantics to React components
introduces impedance mismatch. CoffeeScript, by contrast, compiles directly to
JavaScript and shares its runtime model. `->` becomes `() =>`. `for...in`
becomes `.map()`. The expressions you write in CoffeeHaml attributes *are*
CoffeeScript — no foreign runtime, no translation layer, no surprises.

## Status

**Design phase.** See:
- [Grammar](docs/grammar.md)
- [AST Design](docs/ast.md)
- [Architecture](docs/architecture.md)
- [Syntax Examples](docs/examples.md)