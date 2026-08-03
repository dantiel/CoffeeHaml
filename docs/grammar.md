# CoffeeHaml Grammar

## Notation

```
Rule         := Alternative1 | Alternative2
X?            := zero or one X
X*            := zero or more X
X+            := one or more X
X (sep Y)*    := X optionally followed by repeated (Y X)
'literal'      := literal token
[class]        := character class
[^class]       := negated character class
```

Whitespace is **significant**: indentation determines nesting. The lexer
emits `INDENT`/`DEDENT` tokens analogous to Python/CoffeeScript.

---

## Top-Level Production

```
Document       := (Node | BlankLine)* EOF

BlankLine      := Whitespace* Newline

Node           := Doctype
               | Comment
               | Filter
               | ControlFlow
               | Output
               | Element
               | ImplicitDiv
               | RawText
```

---

## Doctype

```
Doctype        := '!!!' Whitespace? DoctypeValue? Newline
DoctypeValue   := [^\n]+
```

Examples: `!!!`, `!!! 5`, `!!! html`

Emits nothing in React output (React renders into a DOM container, not a full
document). Retained for Haml compatibility; may emit an HTML comment in
non-React backends.

---

## Comments

```
Comment        := HamlComment | HTMLComment

HamlComment    := '-#' Whitespace? CommentText? Newline
                  (Indent Node* Dedent)?
                // Removed entirely from output

HTMLComment    := '/' Whitespace? CommentText? Newline
                  (Indent Node* Dedent)?
                // Emitted as <!-- ... --> in development
```

Haml comments (`-#`) are stripped. HTML comments (`/`) are preserved in the
AST and emitted as `<!-- ... -->` (wrapped in a raw HTML insertion at
runtime).

---

## Elements

```
Element        := '%' TagName TagModifiers? AttributeBlock? InlineContent? SelfClose? Newline
                  (Indent Node* Dedent)?

SelfClose      := '/' Whitespace?    // preceding newline
                // %br/  →  <br />

TagName        := Identifier (':' Identifier)*
                // Allows SVG: %svg:circle, %math:mi

TagModifiers   := (ClassModifier | IdModifier)+
ClassModifier  := '.' ClassName
IdModifier     := '#' IdName

ClassName      := Identifier
IdName         := Identifier

Identifier     := [a-zA-Z_$] [a-zA-Z0-9_$]*
```

### Implicit Div

When a line begins with `.class` or `#id` without a `%tag`, a `<div>` is
implied — exactly as in Haml:

```
ImplicitDiv    := TagModifiers AttributeBlock? InlineContent? Newline
                  (Indent Node* Dedent)?
```

```
.container
  %h1 Hello
```

Is equivalent to:

```
%div.container
  %h1 Hello
```

---

## Attributes

```
AttributeBlock := AttrBraces | AttrParens

AttrBraces     := '{' AttrContent? '}'
AttrParens     := '(' AttrContent? ')'

AttrContent    := Arbitrary CoffeeScript until matching delimiter.
                // Parsed as a CoffeeScript object literal.
                // Comma-optional, supports splats, nested objects,
                // function expressions, destructuring.
```

The content between `{...}` or `(...)` is extracted verbatim and parsed
by the CoffeeScript compiler as an object literal. This means:

```haml
%div{class: "container", id: if active then "on" else "off"}
%Button{onClick: (e) -> handleClick(e), disabled: !ready}
%Panel{
  style: {color: "red", margin: 10}
  "aria-label": "Close"
}
```

All CoffeeScript expression forms are valid inside attribute values:
strings, numbers, bools, functions (`->`), conditionals, existential
operator (`?.`), destructuring, splats (`...`).

---

## Inline Content

```
InlineContent  := Whitespace InlineText? OutputSuffix?

InlineText     := ( [^\n%=] [^\n%]* )?
                // Text up to newline, '%', or '='

OutputSuffix   := '=' Whitespace? Expression
                // Mixed text + output on same line:
                // %p Hello, = user.name
```

Inline content follows the tag and attributes on the same line:

```haml
%h1 Welcome, = user.name
%p This is a paragraph with inline content.
%span.status{class: status} = statusText
```

---

## Output

```
Output         := '='  Whitespace? Expression Newline   // escaped
               | '==' Whitespace? Expression Newline   // unescaped (raw)
```

`=` inserts the result of a CoffeeScript expression as a child node.
`==` inserts without HTML escaping (for raw HTML — use cautiously).

```haml
%h1
  = pageTitle
%div
  = formatMarkdown(content)
  == user.bioHTML
```

---

## Control Flow

```
ControlFlow    := '-' Whitespace? ControlExpression

ControlExpression := IfChain
                  | UnlessBlock
                  | ForBlock
                  | WhileBlock
                  | CoffeeStatement

IfChain        := IfBlock (ElseIfBlock | ElseBlock)*

IfBlock        := 'if' Whitespace Expression Newline
                  (Indent Node* Dedent)?
UnlessBlock    := 'unless' Whitespace Expression Newline
                  (Indent Node* Dedent)?
ElseIfBlock    := 'else' Whitespace 'if' Whitespace Expression Newline
                  (Indent Node* Dedent)?
ElseBlock      := 'else' Newline
                  (Indent Node* Dedent)?

ForBlock       := 'for' Whitespace ForClause Newline
                  (Indent Node* Dedent)?
ForClause      := ForIn | ForOf
ForIn          := Pattern 'in' Expression
ForOf          := Pattern 'of' Expression
Pattern        := Identifier (',' Identifier)*
               | '[' Pattern (',' Pattern)* ']'
               | '{' Pattern (',' Pattern)* '}'

WhileBlock     := 'while' Whitespace Expression Newline
                  (Indent Node* Dedent)?

CoffeeStatement := Any valid CoffeeScript statement.
                 // Arbitrary CoffeeScript code inserted verbatim.
```

Control flow bodies contain CoffeeHaml nodes (elements, output, nested
control flow) and compile to JavaScript that produces child arrays.

```haml
- if user
  %WelcomeBanner{user: user}
- else
  %LoginPrompt

- for item, index in items
  %ItemCard{item: item, key: index}

- unless loading
  %Content{data: data}
```

### Semantics

Control flow bodies compile to expressions that evaluate to arrays of
React elements:

```
- for x in xs          →  ...xs.map((x) => jsx(...))
- if cond              →  ...(cond ? [jsx(...)] : [])
```

---

## Filters

```
Filter         := ':' FilterName Newline
                  (Indent FilterContent Dedent)?

FilterName     := Identifier
FilterContent  := Lines of text at increased indentation.
```

Haml-style filters for embedded content. Common filters:

| Filter | Purpose |
|--------|---------|
| `:css` | Embedded CSS block |
| `:javascript` | Embedded JS block |
| `:coffeescript` | Embedded CoffeeScript block |
| `:markdown` | Markdown content → compiled at build time |
| `:plain` | Pass-through text (no processing) |

```haml
%head
  :css
    body { margin: 0; }
  :javascript
    console.log("loaded");
```

Filters are compiled at build time. `:css` may be extracted or inlined
depending on configuration.

---

## Raw Text / Passthrough

```
RawText        := [^%#\-=/:!. \t\n] [^\n]* Newline
               // Any line not matching a recognized pattern.
               // Treated as literal text (wrapped in a text node).
```

Lines that don't start with a special character (`%`, `.`, `#`, `-`, `=`,
`/`, `:`, `!`) are treated as raw text. This enables "plain text" regions
within templates.

---

## Expression Reference

All `Expression` productions delegate to the CoffeeScript parser. Any
valid CoffeeScript expression is accepted — the CoffeeHaml parser does not
re-invent CoffeeScript's expression grammar.

Key CoffeeScript expression forms used in CoffeeHaml:

```
// Functions
->                   // zero-arg arrow
(x) ->               // single-arg arrow
(x, y) ->            // multi-arg arrow
=>                   // bound arrow (fat arrow)

// Conditionals (expression form)
if cond then a else b
unless cond then a

// Existential
obj?.prop
obj?[key]

// Comprehensions
(x for x in arr)
(x for x in arr when x > 0)

// Splats
arr...
{obj..., newKey: val}

// String interpolation
"Hello, #{name}"

// Heregex
/// pattern /g

// Destructuring
{a, b} = obj
[first, rest...] = arr
```

---

## Tokens (Lexer)

The lexer produces these token types:

| Token | Pattern | Notes |
|-------|---------|-------|
| `TAG` | `%[a-zA-Z_$]` | Element tag |
| `CLASS` | `\.[a-zA-Z_$]` | Class modifier |
| `ID` | `#[a-zA-Z_$]` | ID modifier |
| `ATTR_OPEN_BRACE` | `{` | Attribute block start |
| `ATTR_OPEN_PAREN` | `(` | Attribute block start (alt) |
| `ATTR_CLOSE_BRACE` | `}` | Attribute block end |
| `ATTR_CLOSE_PAREN` | `)` | Attribute block end (alt) |
| `OUTPUT` | `=` | Inline expression output |
| `OUTPUT_RAW` | `==` | Unescaped output |
| `CONTROL` | `-` | Control flow prefix |
| `COMMENT` | `-#` | Haml comment |
| `HTML_COMMENT` | `/` | HTML comment |
| `FILTER` | `:` | Filter prefix |
| `DOCTYPE` | `!!!` | Doctype declaration |
| `SELF_CLOSE` | `/` | Self-closing tag |
| `TEXT` | (fallback) | Literal text |
| `NEWLINE` | `\n`, `\r\n` | Line terminator |
| `INDENT` | (virtual) | Increased indentation |
| `DEDENT` | (virtual) | Decreased indentation |
| `WHITESPACE` | `[ \t]` | Spaces/tabs (handled by indenter) |
| `EOF` | (virtual) | End of file |

The lexer is **context-aware** after certain tokens:
- After `{` or `(`, scan for matching closing delimiter, extracting the
  contained source as a raw string for CoffeeScript parsing.
- After `=`, scan to end of line for expression source.
- After `-`, scan to end of line for control expression source.
- After `:`, scan for filter name.

---

## Indentation Rules

CoffeeHaml uses **significant indentation** exactly like Haml and
CoffeeScript:

1. The first non-blank line of a document establishes the base indent
   level (typically 0).
2. A line with **more** indentation than the current line opens a new
   nesting level → emit `INDENT`.
3. A line with **less** indentation closes one or more nesting levels →
   emit `DEDENT` for each closed level.
4. Tabs and spaces **cannot** be mixed. The indent character is detected
   from the first indented line.
5. Blank lines are ignored for indentation purposes.
6. Multi-line expressions (attribute blocks, expressions) defer the
   `NEWLINE` token until the construct is complete.

```
%div           // indent 0
  %p           // indent 2 → INDENT
    Hello      // indent 4 → INDENT
  %p           // indent 2 → DEDENT
    World      // indent 4 → INDENT
               // EOF → DEDENT, DEDENT
```

---

## Precedence of Line-Level Patterns

When the lexer encounters the start of a line (after optional whitespace),
it checks patterns in this order:

1. `!!!` → Doctype
2. `%` + identifier → Element
3. `.` + identifier → ImplicitDiv (class)
4. `#` + identifier → ImplicitDiv (id)
5. `-#` → HamlComment
6. `/` → HTMLComment (unless followed by `/` or `*`)
7. `-` → ControlFlow
8. `=` / `==` → Output
9. `:` + identifier → Filter
10. anything else → RawText
