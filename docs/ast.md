# CoffeeHaml AST Design

## Overview

The CoffeeHaml AST is a **renderer-agnostic** intermediate representation.
It models the structure of a CoffeeHaml template without committing to any
specific output runtime. The first (and primary) backend targets React's
`jsx-runtime`, but the AST is designed so that emitters for Solid, Vue,
Mithril, or Web Components can be added later.

All AST nodes carry **source location** information for diagnostics and
source map generation.

---

## Node Interface (TypeScript)

```ts
interface SourceLocation {
  line: number;       // 1-based
  column: number;     // 1-based
  offset: number;     // 0-based byte offset
  endLine: number;
  endColumn: number;
  endOffset: number;
}

interface BaseNode {
  type: string;
  loc: SourceLocation;
}

type Node =
  | Document
  | Element
  | ImplicitDiv
  | Text
  | Output
  | ControlFlow
  | Comment
  | Filter
  | Doctype
  | Fragment;
```

---

## Node Types

### `Document`

The root of every CoffeeHaml AST. Wraps all top-level nodes.

```ts
interface Document extends BaseNode {
  type: "Document";
  children: Node[];
}
```

A Document may contain zero or more children. There is no implicit
wrapper — the emitter decides whether to wrap in a Fragment.

---

### `Element`

The primary structural node. Represents `%tag` with optional modifiers,
attributes, and children.

```ts
interface Element extends BaseNode {
  type: "Element";
  tag: string;                          // e.g. "div", "svg:circle", "MyComponent"
  classes: string[];                    // from .class modifiers
  id: string | null;                    // from #id modifier
  attributes: Attribute[];             // from {...} or (...)
  inlineText: string | null;           // inline text content
  inlineOutput: Expression | null;     // trailing = expr on same line
  selfClose: boolean;                  // %br/
  children: Node[];                    // indented children
  isComponent: boolean;                // derived: tag[0] is uppercase
}
```

**`isComponent` derivation**: If `tag[0]` matches `[A-Z]`, the element
refers to a React component (or similar in other frameworks). The emitter
uses this to decide whether to emit `jsx("div", ...)` or
`jsx(MyComponent, ...)`.

**`classes` and `id`**: Extracted from `.class` and `#id` modifiers.
These are merged into the `attributes` during emission (as `className`
and `id` respectively).

### `Attribute`

```ts
type AttributeValue =
  | { kind: "expression"; source: string; parsed: CoffeeAstNode }
  | { kind: "string"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "number"; value: number }
  | { kind: "null" }
  | { kind: "undefined" }
  | { kind: "splat"; source: string };  // for ...spread

interface Attribute extends BaseNode {
  type: "Attribute";
  name: string;                         // property name
  value: AttributeValue;
  shorthand: boolean;                   // {disabled} → {disabled: true}
}
```

Attributes are parsed from the CoffeeScript object literal inside
`{...}` or `(...)`. The CoffeeScript compiler provides the parsed
expression AST for each value.

---

### `ImplicitDiv`

Created when a line starts with `.class` or `#id` without a `%tag`.

```ts
interface ImplicitDiv extends BaseNode {
  type: "ImplicitDiv";
  tag: "div";                           // always "div"
  classes: string[];
  id: string | null;
  attributes: Attribute[];
  inlineText: string | null;
  inlineOutput: Expression | null;
  selfClose: false;
  children: Node[];
}
```

This is effectively an `Element` with `tag: "div"`. It exists as a
separate node type only for source-accurate diagnostics (so the compiler
can say "implicit div at line 3" rather than lying about the tag).

---

### `Text`

Literal text content. Produced from inline text on elements or from
raw text lines.

```ts
interface Text extends BaseNode {
  type: "Text";
  value: string;                        // the text content
  htmlSafe: boolean;                    // true if from ==, false if from =
}
```

---

### `Output`

Represents `= expression` (escaped) or `== expression` (raw).

```ts
interface Output extends BaseNode {
  type: "Output";
  expression: Expression;               // parsed CoffeeScript
  escape: boolean;                      // true for =, false for ==
}
```

---

### `Expression`

Wraps a CoffeeScript expression with its raw source and parsed AST.

```ts
interface Expression extends BaseNode {
  type: "Expression";
  source: string;                       // raw CoffeeScript source
  parsed: CoffeeAstNode;               // CoffeeScript AST (foreign)
}
```

The `parsed` field holds the CoffeeScript compiler's AST for the
expression. The emitter compiles this to JavaScript and embeds it
in the output.

---

### `ControlFlow`

Represents structural control flow: `- if`, `- for`, `- while`, `- else`,
and arbitrary CoffeeScript statements.

```ts
type ControlKind =
  | "if"
  | "unless"
  | "else"
  | "else_if"
  | "for"
  | "while"
  | "statement";                         // arbitrary CoffeeScript

interface ControlFlow extends BaseNode {
  type: "ControlFlow";
  kind: ControlKind;
  expression: Expression | null;         // null for `else`
  pattern: Pattern | null;               // for `for`: destructuring pattern
  iterator: Expression | null;           // for `for`: the collection
  body: Node[];                          // indented children
  alternate: ControlFlow | null;         // chained else/else if
}
```

**Chaining**: `- if` / `- else if` / `- else` form a chain via `alternate`:

```
- if a                 ControlFlow { kind: "if", expr: a, body: [...],
  %p A                   alternate: ControlFlow { kind: "else", body: [...] } }
- else
  %p B
```

**For loops**: The `pattern` and `iterator` fields capture the
CoffeeScript for-comprehension structure. The `body` elements become
the comprehension body.

---

### `Comment`

```ts
interface Comment extends BaseNode {
  type: "Comment";
  kind: "haml" | "html";
  text: string;
  children: Node[];                     // nested content (rare)
}
```

---

### `Filter`

```ts
interface Filter extends BaseNode {
  type: "Filter";
  name: string;                         // e.g. "css", "javascript", "markdown"
  content: string;                      // raw filter content (dedented)
}
```

---

### `Doctype`

```ts
interface Doctype extends BaseNode {
  type: "Doctype";
  value: string;                        // e.g. "html", "5", ""
}
```

---

### `Fragment`

Represents an explicit fragment wrapper (for cases where multiple
siblings need a key or where the user explicitly groups nodes). Not
yet in the grammar; reserved for future use.

```ts
interface Fragment extends BaseNode {
  type: "Fragment";
  children: Node[];
  key: Expression | null;
}
```

---

## AST Construction Example

Given:

```haml
%div.container#main{style: {color: "red"}}
  %h1
    = pageTitle
  - for item in items
    %ItemCard{item: item}
```

Produces:

```json
{
  "type": "Document",
  "children": [
    {
      "type": "Element",
      "tag": "div",
      "classes": ["container"],
      "id": "main",
      "attributes": [
        {
          "type": "Attribute",
          "name": "style",
          "value": { "kind": "expression", "source": "{color: \"red\"}", "parsed": null }
        }
      ],
      "inlineText": null,
      "inlineOutput": null,
      "selfClose": false,
      "isComponent": false,
      "children": [
        {
          "type": "Element",
          "tag": "h1",
          "classes": [],
          "id": null,
          "attributes": [],
          "inlineText": null,
          "inlineOutput": null,
          "selfClose": false,
          "isComponent": false,
          "children": [
            {
              "type": "Output",
              "expression": { "type": "Expression", "source": "pageTitle", "parsed": null },
              "escape": true
            }
          ]
        },
        {
          "type": "ControlFlow",
          "kind": "for",
          "expression": null,
          "pattern": { "type": "Pattern", "names": ["item"] },
          "iterator": { "type": "Expression", "source": "items", "parsed": null },
          "body": [
            {
              "type": "Element",
              "tag": "ItemCard",
              "classes": [],
              "id": null,
              "attributes": [
                {
                  "type": "Attribute",
                  "name": "item",
                  "value": { "kind": "expression", "source": "item", "parsed": null }
                }
              ],
              "inlineText": null,
              "inlineOutput": null,
              "selfClose": false,
              "isComponent": true,
              "children": []
            }
          ],
          "alternate": null
        }
      ]
    }
  ]
}
```

---

## Traversal

The AST supports a generic visitor pattern:

```ts
interface Visitor<T = void> {
  Document?: (node: Document) => T;
  Element?: (node: Element) => T;
  ImplicitDiv?: (node: ImplicitDiv) => T;
  Text?: (node: Text) => T;
  Output?: (node: Output) => T;
  ControlFlow?: (node: ControlFlow) => T;
  Comment?: (node: Comment) => T;
  Filter?: (node: Filter) => T;
  Doctype?: (node: Doctype) => T;
  Fragment?: (node: Fragment) => T;
}

function walk<T>(node: Node, visitor: Visitor<T>): T;
```

---

## Immutability

The AST is **immutable** after construction. Transformations (if any)
produce new AST nodes. This simplifies source mapping and incremental
compilation.

---

## Source Mapping

Every node carries its `SourceLocation`. During emission, the emitter
records mappings from generated JS positions back to CoffeeHaml source
positions using the `loc` fields. This enables:

- Accurate error messages pointing to CoffeeHaml source
- Debugger breakpoints in CoffeeHaml source
- Stack traces referencing CoffeeHaml lines
