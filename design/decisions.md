# Design Decisions

## Why not just use Haml + CoffeeScript separately?

Existing Haml implementations (Haml, Hamlit, etc.) are tightly coupled to
Ruby semantics and the Ruby runtime. CoffeeScript is its own language
that compiles to JavaScript. Combining them would require either:

1. Haml → Ruby → ??? → JavaScript (convoluted)
2. A unified compiler that understands both (CoffeeHaml)

We choose option 2: a single compiler that natively understands Haml
structure with CoffeeScript semantics and emits JavaScript directly.

## Why `jsx()` / `jsxs()` instead of JSX text?

React 17+ introduced the `react/jsx-runtime` which allows using `jsx()`
and `jsxs()` function calls directly instead of JSX transform. This means
CoffeeHaml output is plain JavaScript — no JSX transform step needed,
no need to emit XML-like syntax and then parse it again.

Benefits:
- Simpler output (function calls, not tagged templates or JSX)
- Faster compilation (no JSX → JS transform)
- Cleaner stack traces
- Easier to source-map

## Why delegate to CoffeeScript for expressions?

CoffeeScript has a complex expression grammar with many features
(implicit returns, comprehensions, existential operator, splats,
destructuring, heregexes, string interpolation, etc.). Re-implementing
this would be:

1. A massive undertaking
2. A maintenance burden
3. Likely bug-for-bug incompatible

By delegating to the CoffeeScript compiler for expression parsing,
CoffeeHaml gains full CoffeeScript expression support "for free" and
stays compatible with the CoffeeScript ecosystem.

The CoffeeHaml compiler only handles **structural** parsing: tags,
nesting, attributes, control flow keywords, filters, and comments.

## Attribute syntax: `{}` vs `()`

Haml uses `{}` with Ruby hash syntax. CoffeeScript uses `{}` for object
literals. The overlap is nearly perfect.

We also support `(...)` for two reasons:

1. It feels natural for React components (looks like JSX attribute
   passing: `<Component prop={value}>` vs `%Component(prop: value)`)
2. Some Haml dialects use it; some users prefer it

Internally, both are identical. The parser extracts the content between
delimiters and parses it as a CoffeeScript object literal.

## Control flow: `- for` vs JSX `.map()`

In JSX, iteration requires embedding `.map()` calls inside `{}`:

```jsx
{items.map(item => <ItemCard item={item} key={item.id} />)}
```

CoffeeHaml uses Haml's `-` prefix with CoffeeScript's `for`:

```haml
- for item in items
  %ItemCard{item: item, key: item.id}
```

The compiler converts the `for` body into a `.map()` callback. This is
cleaner because:

1. No `.map()` boilerplate
2. No wrapping `{}` for JSX expressions
3. The iteration body is structurally clear (indented block)
4. CoffeeScript's `when` clause can replace `.filter().map()`

## Indentation: spaces vs tabs

CoffeeHaml follows CoffeeScript's approach: detect the indentation
character from the first indented line, then require consistency.
Mixing is an error.

Haml also uses significant indentation, so this is familiar territory.

## Filter handling: build-time vs runtime

`:css` and `:javascript` filters could be handled at runtime (inject
`<style>` / `<script>` tags) or at build time (extract to separate files).

CoffeeHaml handles this at **build time** through the Vite plugin:

- `:css` → extracted to CSS module, imported by the component
- `:javascript` → extracted to JS module
- `:markdown` → compiled to HTML at build time, inlined as string

This aligns with modern build tooling (Vite, webpack) and avoids runtime
overhead.

## Self-closing tags: `%br/` vs `%br`

Haml uses `%br/` for self-closing tags. CoffeeHaml keeps this convention.
The `/` is required for void elements that should not have children.

In React, this distinction matters less (React handles `<br>` and
`<br />` identically), but the syntax preserves Haml compatibility and
clearly signals author intent.

## Implicit Fragment

When a CoffeeHaml document has multiple top-level nodes, the emitter
wraps them in a React Fragment (`jsxs(Fragment, {}, ...)`). This matches
JSX behavior where returning multiple elements requires a wrapper.

Unlike JSX, CoffeeHaml does not require a `<>...</>` wrapper — the
fragment is implicit.

## Lowercase = HTML, Uppercase = Component

This follows React's JSX convention exactly. The compiler checks the
first character of the tag name:

- `[a-z]` → HTML element → `jsx("div", ...)`
- `[A-Z]` → Component reference → `jsx(Component, ...)`

Dotted component names (`%Router.Link`) are supported and emit as
`Router.Link` (a member expression, not a string).

## No runtime

CoffeeHaml has **zero runtime footprint**. The compiler emits standard
`react/jsx-runtime` calls. There is no CoffeeHaml library to import at
runtime, no helper functions, no base component class.

This is a deliberate constraint that keeps CoffeeHaml lean and ensures
it can be used with any React version that supports the JSX runtime
(React 17+).

## Future: other backends

The AST is designed to be renderer-agnostic. While the first backend
targets React, the AST nodes carry no React-specific semantics. An
emitter for SolidJS would walk the same AST and emit Solid's
`createElement` calls. Same for Vue's `h()` function, etc.

This also enables:
- Static site generation (emit HTML directly)
- Email templates (emit HTML with inline styles)
- Multi-framework component libraries

## What CoffeeHaml is NOT

- **Not a replacement for React** — React is the runtime
- **Not a replacement for CoffeeScript** — CoffeeScript is the expression language
- **Not a CSS preprocessor** — though `:css` filters may integrate with CSS modules
- **Not a type checker** — TypeScript types can be used alongside CoffeeHaml
- **Not a full Haml port** — Ruby-specific Haml features (helpers, `= yield`, etc.) are not supported
