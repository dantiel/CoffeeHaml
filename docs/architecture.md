# CoffeeHaml Architecture

## Compiler Pipeline

```
CoffeeHaml Source
       │
       ▼
  ┌──────────┐
  │  Lexer   │  Tokenizes source into Token stream
  └──────────┘  (INDENT/DEDENT inserted by IndentProcessor)
       │
       ▼
  ┌──────────┐
  │  Parser  │  Recursive descent, produces CoffeeHaml AST
  └──────────┘  Delegates expressions to CoffeeScript parser
       │
       ▼
  ┌──────────┐
  │ Resolver │  Resolves imports, validates identifiers
  └──────────┘  (optional: type-checking pass)
       │
       ▼
  ┌──────────┐
  │ Emitter  │  Walks AST, emits JavaScript with jsx()/jsxs()
  └──────────┘  Produces final .js/.jsx output + source map
       │
       ▼
  JavaScript + Source Map
```

---

## Phase 1: Lexer

### Responsibilities

- Scan raw CoffeeHaml source into a stream of tokens
- Handle significant whitespace (INDENT/DEDENT)
- Extract raw source for expression blocks (`{...}`, `(...)`, `= expr`)
- Preserve source locations for every token

### Token Stream

```
Source:  %div.container#main\n  %p Hello\n

Tokens:
  TAG "%div"          @ 1:1
  CLASS ".container"  @ 1:4
  ID "#main"          @ 1:14
  NEWLINE             @ 1:19
  INDENT              @ 2:1
  TAG "%p"            @ 2:3
  TEXT "Hello"        @ 2:6
  NEWLINE             @ 2:11
  DEDENT              @ EOF
  EOF                 @ EOF
```

### Indentation Processor

The lexer contains an internal `IndentStack` that tracks indentation
levels. On each non-blank line:

1. Compute the line's indent depth (spaces or tabs)
2. Compare to the top of the stack
3. If deeper → push, emit `INDENT`
4. If equal → continue
5. If shallower → pop and emit `DEDENT` for each level until match

```
IndentStack: [0]
Line "  text" (depth 2) → push 2, emit INDENT
Line "    more" (depth 4) → push 4, emit INDENT
Line "  text" (depth 2) → pop 4 (DEDENT), match 2
Line "" (blank) → skip
EOF → pop 2 (DEDENT), pop 0 (DEDENT)
```

### Expression Extraction

When the lexer encounters `{`, it enters a **brace-scanning mode**:

1. Track nesting depth of `{`/`}`
2. Track string boundaries (`"`, `'`, `"""`, `'''`, `"` backtick)
3. Track comment boundaries (`#` line comments, `###` block comments)
4. Track regex boundaries (`///`)
5. When depth reaches 0, emit the entire span as one token

Similar logic for `(...)` attribute blocks.

After `=` or `-`, the lexer scans to end-of-line and emits the
expression source as a token.

```
Source: %div{class: "hello}"}
                           ↑
                           This brace is inside a string → ignored
```

### Token Types (Full Enumeration)

```ts
enum TokenKind {
  // Structural
  TAG,              // %div
  CLASS,            // .container
  ID,               // #main

  // Attributes
  ATTR_BRACE_OPEN,  // {   (with extracted content)
  ATTR_BRACE_CLOSE, // }
  ATTR_PAREN_OPEN,  // (   (with extracted content)
  ATTR_PAREN_CLOSE, // )

  // Inline
  TEXT,             // literal text
  OUTPUT,           // =
  OUTPUT_RAW,       // ==

  // Control
  CONTROL,          // -
  COMMENT_HAML,     // -#
  COMMENT_HTML,     // /
  FILTER,           // :css, :javascript, etc.
  DOCTYPE,          // !!!

  // Meta
  NEWLINE,
  INDENT,
  DEDENT,
  EOF,
}
```

---

## Phase 2: Parser

### Architecture

The parser is a **recursive descent** parser with one token of lookahead.
It consumes the token stream from the lexer and produces the CoffeeHaml
AST.

For CoffeeScript expressions (attributes, outputs, control conditions),
the parser delegates to the **CoffeeScript compiler's parser** —
specifically `CoffeeScript.parse()` — to obtain a CoffeeScript AST for
the expression source. This avoids re-implementing CoffeeScript's
expression grammar.

### Parser State

```ts
class CoffeeHamlParser {
  private tokens: Token[];
  private pos: number;
  private indentStack: number[];

  constructor(source: string);

  // Entry point
  parse(): Document;

  // Node parsers
  private parseNode(): Node;
  private parseElement(): Element;
  private parseImplicitDiv(): ImplicitDiv;
  private parseText(): Text;
  private parseOutput(): Output;
  private parseControlFlow(): ControlFlow;
  private parseComment(): Comment;
  private parseFilter(): Filter;
  private parseDoctype(): Doctype;
  private parseChildren(): Node[];

  // Helpers
  private peek(): Token;
  private advance(): Token;
  private expect(kind: TokenKind): Token;
  private parseExpression(raw: string): Expression;
  private parseAttributes(raw: string): Attribute[];
}
```

### Parsing Algorithm

```
parse():
  create Document node
  while not EOF:
    skip blank lines
    node = parseNode()
    append node to document.children
  return document

parseNode():
  token = peek()
  switch:
    case "!!!"     → parseDoctype()
    case "%"       → parseElement()
    case "."       → parseImplicitDiv()
    case "#"       → parseImplicitDiv()
    case "-#"      → parseComment()
    case "/"       → parseComment() or parseFilter()?  (context)
    case "-"       → parseControlFlow()
    case "="       → parseOutput()
    case ":"       → parseFilter()
    default        → parseText()

parseElement():
  advance TAG
  parse tag modifiers (.class, #id) while peek is CLASS or ID
  if peek is ATTR_BRACE_OPEN: parse attribute block
  if peek is TEXT: parse inline text
  if inline text contains '=': parse inline output suffix
  if peek is SELF_CLOSE + NEWLINE: mark self-closing
  advance NEWLINE
  if next token is INDENT:
    children = parseChildren()
  return Element { ... }

parseChildren():
  advance INDENT
  nodes = []
  while not DEDENT and not EOF:
    nodes.push(parseNode())
  advance DEDENT
  return nodes
```

### Expression Delegation

When the parser needs to parse a CoffeeScript expression (e.g., the
content of `{...}` attributes), it:

1. Extracts the raw source string from the token
2. Calls `CoffeeScript.parse(source)` to get a CoffeeScript AST
3. Wraps it in our `Expression` node
4. For attribute blocks, walks the CoffeeScript object literal AST
   to extract individual `Attribute` nodes

```ts
parseAttributes(raw: string): Attribute[] {
  // Wrap in braces and parse as CoffeeScript object
  const objAst = CoffeeScript.parse(`{${raw}}`);
  // Walk the object literal AST to extract key-value pairs
  return extractAttributes(objAst);
}
```

### Error Recovery

The parser uses a simple **panic mode** recovery:

1. On parse error, skip tokens until NEWLINE or DEDENT
2. Record the error in a diagnostic list
3. Continue parsing subsequent nodes

This enables reporting multiple errors in one pass.

---

## Phase 3: AST Resolver (Optional)

Before emission, a resolver pass may:

1. **Validate component references**: Check that capitalized tags resolve
   to identifiers in scope (requires import analysis)
2. **Resolve filter processors**: Map filter names to handler functions
3. **Optimize static subtrees**: Mark subtrees that are fully static
   (no expressions, no control flow) for potential hoisting

This phase is optional for initial implementation but important for
producing good diagnostics.

---

## Phase 4: Emitter (React JSX Runtime Backend)

### Architecture

The emitter walks the CoffeeHaml AST and generates JavaScript source
code that uses `react/jsx-runtime`.

```ts
class ReactJSRuntimeEmitter {
  private sourceMap: SourceMapGenerator;
  private indentLevel: number;

  emit(document: Document): { code: string; map: SourceMap };

  private emitNode(node: Node): string;
  private emitElement(node: Element): string;
  private emitChildren(children: Node[]): string;
  private emitControlFlow(node: ControlFlow): string;
  // ...
}
```

### Core Emission Rules

#### Element → `jsx()` or `jsxs()`

An element with **no children** (and no inline text/output) emits `jsx()`:

```ts
// %br/
jsx("br", null)
```

An element with **one child** may also use `jsx()`:

```ts
// %div Hello
jsx("div", { children: "Hello" })
```

An element with **multiple children** uses `jsxs()`:

```ts
// %div
//   %p A
//   %p B
jsxs("div", {}, jsx("p", {}, "A"), jsx("p", {}, "B"))
```

#### Component vs HTML element

```ts
// %MyComponent{prop: val}
jsx(MyComponent, { prop: val })

// %div{id: "main"}
jsx("div", { id: "main" })
```

#### Attributes merging

`.class` and `#id` modifiers merge with explicit attributes:

```haml
%div.container#main{id: "override", "data-x": "y"}
```

```js
jsx("div", { className: "container", id: "override", "data-x": "y" })
```

If both `#id` and `{id: ...}` are present, the explicit attribute wins.

Multiple `.class` modifiers concatenate with spaces.

#### Inline text

```haml
%p Hello, = name
```

```js
jsx("p", {}, "Hello, ", name)
```

#### Control flow children

This is the most complex emission case. Control flow bodies become
arrays spread into the parent's children:

```haml
%div
  - for item in items
    %ItemCard{item: item}
```

```js
jsxs("div", {},
  ...items.map(item => jsx(ItemCard, { item }))
);
```

The general pattern:

```
- for PATTERN in EXPR      →  ...EXPR.map((PATTERN) => BODY)
- if COND                  →  ...(COND ? [BODY] : [])
- if COND ... - else       →  ...(COND ? [BODY] : [ALTERNATE])
- unless COND              →  ...(!COND ? [BODY] : [])
```

**For loop with index**:

```haml
- for item, idx in items
  %Row{item: item, key: idx}
```

```js
...items.map((item, idx) => jsx(Row, { item, key: idx }))
```

**Nested control flow**:

```haml
%div
  - if user
    %WelcomeBanner{user: user}
    - for post in user.posts
      %PostCard{post: post}
  - else
    %LoginPrompt
```

```js
jsxs("div", {},
  ...(user ? [
    jsx(WelcomeBanner, { user }),
    ...user.posts.map(post => jsx(PostCard, { post }))
  ] : [
    jsx(LoginPrompt, {})
  ])
);
```

#### Arbitrary CoffeeScript statements

```
- console.log("rendering")
%div Hello
```

```js
console.log("rendering");
jsx("div", {}, "Hello");
```

Statements that produce no value are emitted as-is and do not affect
the parent's child array.

#### Output (`=`, `==`)

```haml
= user.name
```

```js
user.name
```

Output nodes compile directly to their CoffeeScript expression compiled
to JavaScript. The parent element wraps them as children.

#### Filters

```haml
:css
  body { margin: 0 }
```

```js
// Compiled at build time; options:
// 1. Inline as <style> tag (via jsx):
jsx("style", {}, "body { margin: 0 }")
// 2. Extract to CSS file (Vite plugin integrates with CSS pipeline)
// 3. Inline as string for CSS-in-JS libraries
```

The filter handler is pluggable; the emitter delegates to registered
filter processors.

---

### Module Wrapper

The emitter wraps output in a module that imports from
`react/jsx-runtime`:

```js
import { jsx, jsxs, Fragment } from "react/jsx-runtime";
export default function CoffeeHamlComponent() {
  // emitted nodes
}
```

The component name and export style are configurable (default export,
named export, arrow function, etc.).

---

## Vite Plugin Integration

```
Vite config
    │
    ▼
┌─────────────────┐
│ vite-plugin-     │  Intercepts .haml / .coffeehaml imports
│   coffeehaml     │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ CoffeeHaml       │  Compiles source → JS + source map
│ Compiler         │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Vite HMR         │  File change → recompile → HMR update
│ pipeline         │
└─────────────────┘
```

The Vite plugin:

1. Matches `.haml` and `.coffeehaml` file extensions
2. Compiles CoffeeHaml → JavaScript using the compiler
3. Returns compiled JS + source map to Vite
4. Handles HMR by recompiling on file change
5. Optionally processes filter blocks (`:css` → CSS extraction)

---

## Incremental Compilation

For incremental builds, the compiler caches:

- The parsed AST (keyed by file hash)
- Resolved import maps
- Compiled filter output

On file change:
1. Check if the file's hash changed
2. If yes, re-lex and re-parse only that file
3. Re-emit only the changed file
4. Invalidate dependent files (files that import the changed file)

---

## Source Maps

Every emission step records mappings:

```
CoffeeHaml source position → JavaScript output position
```

The emitter uses the `loc` fields on AST nodes to create source mappings.
For CoffeeScript expressions, the CoffeeScript compiler provides its own
source maps, which are composed with the CoffeeHaml source maps.

This yields a **composed source map** chain:

```
Browser JS position
  → CoffeeHaml JS output position
    → CoffeeHaml source position
```

For CoffeeScript expressions, there's an intermediate step:

```
Browser JS position
  → CoffeeHaml JS output position
    → CoffeeScript source position (within attribute/expression)
      → CoffeeHaml source position (the expression as a whole)
```

---

## Error Reporting

Errors reference CoffeeHaml source locations:

```
Error: Unknown component "MyCopmonent" (did you mean "MyComponent"?)
  at src/components/Dashboard.coffeehaml:12:3
    11 |
    12 |   %MyCopmonent{data: items}
          ^
    13 |
```

The compiler produces structured diagnostics:

```ts
interface Diagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  loc: SourceLocation;
  hint?: string;        // suggested fix
  code?: string;        // error code for documentation
}
```

---

## Implementation Language

The compiler is implemented in **TypeScript** for:

- Type safety and self-documenting interfaces
- First-class Node.js/Vite ecosystem integration
- Access to the CoffeeScript compiler's JS API
- Ease of contribution from the React community

The CoffeeScript dependency is used solely for **expression parsing** —
the CoffeeHaml compiler itself does not re-implement CoffeeScript.

```json
{
  "dependencies": {
    "coffeescript": "^2.7.0"
  }
}
```

Future: A self-hosting CoffeeHaml compiler written in CoffeeHaml + a
Node.js backend would be poetically satisfying, but is not a v1 goal.
