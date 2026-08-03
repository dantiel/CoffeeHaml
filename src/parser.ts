import { Token, TokenType } from './lexer.js';
import {
  Document, Element, ImplicitDiv, Text, Output, ControlFlow,
  Comment, Filter, Doctype, Expression, Attribute,
  Node, OutputKind, ControlFlowKind,
} from './ast.js';
import { SourceLocation, CompileError } from './types.js';

// ─── Parser State ──────────────────────────────────────────

class ParserState {
  tokens: Token[];
  pos: number;
  filename?: string;

  constructor(tokens: Token[], filename?: string) {
    this.tokens = tokens;
    this.pos = 0;
    this.filename = filename;
  }

  get current(): Token | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : null;
  }

  get peek(): Token | null {
    return this.pos + 1 < this.tokens.length ? this.tokens[this.pos + 1] : null;
  }

  advance(): Token | null {
    const token = this.current;
    this.pos++;
    return token;
  }

  expect(type: TokenType): Token {
    const token = this.current;
    if (!token || token.type !== type) {
      throw new CompileError(
        `Expected ${type} but got ${token?.type ?? 'EOF'}`,
        'parser',
        'UNEXPECTED_TOKEN',
        token?.location,
      );
    }
    return this.advance()!;
  }

  skip(type: TokenType): boolean {
    if (this.current?.type === type) {
      this.advance();
      return true;
    }
    return false;
  }

  isAt(type: TokenType): boolean {
    return this.current?.type === type;
  }
}

// ─── Public API ────────────────────────────────────────────

export function parse(tokens: Token[], filename?: string): Document {
  const state = new ParserState(tokens, filename);

  // Collect prologue (raw JS lines before the first HAML construct)
  const prologue: string[] = [];
  while (state.current?.type === TokenType.PROLOGUE) {
    prologue.push(state.advance()!.value);
  }

  const children = parseBlock(state);
  return new Document(children, prologue);
}

// ─── Block Parsing ─────────────────────────────────────────

/** Parse nodes until DEDENT or EOF. */
function parseBlock(state: ParserState): Node[] {
  const nodes: Node[] = [];

  while (state.current && state.current.type !== TokenType.DEDENT) {
    const node = parseNode(state);
    if (node) nodes.push(node);
  }

  return nodes;
}

// ─── Node Dispatcher ───────────────────────────────────────

function parseNode(state: ParserState): Node | null {
  const token = state.current;
  if (!token) return null;

  switch (token.type) {
    case TokenType.TAG:
      return parseElement(state);
    case TokenType.CLASS:
    case TokenType.ID:
      return parseImplicitDiv(state);
    case TokenType.OUTPUT:
    case TokenType.OUTPUT_UNESC:
      return parseOutput(state);
    case TokenType.CONTROL:
      return parseControlFlow(state);
    case TokenType.COMMENT:
      return parseComment(state);
    case TokenType.HTML_COMMENT:
      return parseHtmlComment(state);
    case TokenType.FILTER:
      return parseFilter(state);
    case TokenType.DOCTYPE:
      return parseDoctype(state);
    case TokenType.TEXT:
      return parseText(state);
    case TokenType.INDENT:
      state.advance(); // skip, handled by parseBlock
      return null;
    case TokenType.DEDENT:
      return null; // handled by parseBlock loop
    case TokenType.NEWLINE:
      state.advance();
      return null;
    default:
      state.advance();
      return null;
  }
}

// ─── Element ───────────────────────────────────────────────

function parseElement(state: ParserState): Element {
  const tagToken = state.expect(TokenType.TAG);
  const tag = tagToken.value;
  const isComponent = /^[A-Z]/.test(tag);

  let classes: string[] = [];
  let id: string | null = null;
  let attributes: Attribute[] = [];
  let isSelfClosing = false;

  // Parse modifiers and attributes
  while (state.current &&
    (state.current.type === TokenType.CLASS ||
     state.current.type === TokenType.ID ||
     state.current.type === TokenType.ATTRS_BRACE ||
     state.current.type === TokenType.ATTRS_PAREN ||
     state.current.type === TokenType.SELF_CLOSE)) {

    const tok = state.current;

    if (tok.type === TokenType.CLASS) {
      state.advance();
      classes.push(tok.value);
    } else if (tok.type === TokenType.ID) {
      state.advance();
      id = tok.value; // last #id wins
    } else if (tok.type === TokenType.ATTRS_BRACE) {
      state.advance();
      attributes.push(...parseAttributeBlock(tok.value, '{}', tagToken.location));
    } else if (tok.type === TokenType.ATTRS_PAREN) {
      state.advance();
      attributes.push(...parseAttributeBlock(tok.value, '()', tagToken.location));
    } else if (tok.type === TokenType.SELF_CLOSE) {
      state.advance();
      isSelfClosing = true;
    }
  }

  // Parse inline text or output if present
  let children: Node[] = [];
  if (state.current && !isSelfClosing) {
    if (state.current.type === TokenType.OUTPUT) {
      const tok = state.advance()!;
      children.push(new Output(new Expression(tok.value), 'escaped', tok.location));
    } else if (state.current.type === TokenType.OUTPUT_UNESC) {
      const tok = state.advance()!;
      children.push(new Output(new Expression(tok.value), 'unescaped', tok.location));
    } else if (state.current.type === TokenType.TEXT) {
      const textToken = state.advance()!;
      children.push(new Text(textToken.value, textToken.location));
    }
  }

  // Parse child block if INDENT follows
  if (state.current?.type === TokenType.INDENT && !isSelfClosing) {
    state.advance(); // consume INDENT
    children = children.concat(parseBlock(state));
    state.expect(TokenType.DEDENT);
  }

  return new Element(tag, { classes, id, attributes, children, isComponent, isSelfClosing, location: tagToken.location });
}

// ─── ImplicitDiv ───────────────────────────────────────────

function parseImplicitDiv(state: ParserState): ImplicitDiv {
  let classes: string[] = [];
  let id: string | null = null;
  let attributes: Attribute[] = [];

  const firstToken = state.current!; // for location

  while (state.current &&
    (state.current.type === TokenType.CLASS ||
     state.current.type === TokenType.ID ||
     state.current.type === TokenType.ATTRS_BRACE ||
     state.current.type === TokenType.ATTRS_PAREN)) {

    const tok = state.current;

    if (tok.type === TokenType.CLASS) {
      state.advance();
      classes.push(tok.value);
    } else if (tok.type === TokenType.ID) {
      state.advance();
      id = tok.value;
    } else if (tok.type === TokenType.ATTRS_BRACE) {
      state.advance();
      attributes.push(...parseAttributeBlock(tok.value, '{}', firstToken.location));
    } else if (tok.type === TokenType.ATTRS_PAREN) {
      state.advance();
      attributes.push(...parseAttributeBlock(tok.value, '()', firstToken.location));
    }
  }

  // Parse inline text
  let children: Node[] = [];
  if (state.current && state.current.type === TokenType.TEXT) {
    const textToken = state.advance()!;
    children.push(new Text(textToken.value, textToken.location));
  }

  // Parse child block
  if (state.current?.type === TokenType.INDENT) {
    state.advance();
    children = children.concat(parseBlock(state));
    state.expect(TokenType.DEDENT);
  }

  return new ImplicitDiv({ classes, id, attributes, children, location: firstToken.location });
}

// ─── Output ────────────────────────────────────────────────

function parseOutput(state: ParserState): Output {
  const token = state.current!;
  const outputKind: OutputKind = token.type === TokenType.OUTPUT ? 'escaped' : 'unescaped';
  state.advance();
  const expr = new Expression(token.value, undefined);
  return new Output(expr, outputKind, token.location);
}

// ─── Control Flow ──────────────────────────────────────────

function parseControlFlow(state: ParserState): ControlFlow {
  const token = state.expect(TokenType.CONTROL);
  let source = token.value;

  // Normalize "else if" → "if" so it chains naturally in ternary
  if (/^\s*else\s+if\b/.test(source)) {
    source = source.replace(/^\s*else\s+/, '');
  }

  // Parse the control kind from the expression
  const controlKind = parseControlKind(source);

  // Strip the keyword from the expression — store only the condition/iterable
  const exprSource = stripControlKeyword(source, controlKind);
  const expr = new Expression(exprSource, undefined);

  // Parse body if INDENT follows
  let children: Node[] = [];
  if (state.current?.type === TokenType.INDENT) {
    state.advance();
    children = parseBlock(state);
    state.expect(TokenType.DEDENT);
  }

  // Check for chained else / else if
  let next: ControlFlow | null = null;
  if (state.current?.type === TokenType.CONTROL) {
    const nextSource = state.current.value.trimStart();
    if (isElse(nextSource)) {
      next = parseControlFlow(state);
    }
  }

  return new ControlFlow(controlKind, expr, children, next, token.location);
}

function parseControlKind(source: string): ControlFlowKind {
  const trimmed = source.trimStart();
  const keyword = trimmed.split(/\s+/)[0];
  switch (keyword) {
    case 'if': return 'if';
    case 'unless': return 'unless';
    case 'for': return 'for';
    case 'while': return 'while';
    case 'else': return 'else';
    default: return 'if'; // default
  }
}

function stripControlKeyword(source: string, kind: ControlFlowKind): string {
  const trimmed = source.trimStart();
  // Remove the keyword and any whitespace after it
  const keyword = kind === 'else' ? 'else' : kind;
  const re = new RegExp(`^\\s*${keyword}\\b\\s*`);
  return trimmed.replace(re, '');
}

function isElse(source: string): boolean {
  return /^\s*else\b/.test(source);
}

// ─── Comments ──────────────────────────────────────────────

function parseComment(state: ParserState): Comment {
  const token = state.expect(TokenType.COMMENT);
  return new Comment('haml', token.value, token.location);
}

function parseHtmlComment(state: ParserState): Comment {
  const token = state.expect(TokenType.HTML_COMMENT);
  return new Comment('html', token.value, token.location);
}

// ─── Filter ────────────────────────────────────────────────

function parseFilter(state: ParserState): Filter {
  const token = state.expect(TokenType.FILTER);
  const parts = token.value.split('\n');
  const filterName = parts[0];
  let content = parts.slice(1).join('\n');

  // Consume indented children as filter body (Haml convention).
  // After `:markdown`, all indented content belongs to the filter.
  if (state.isAt(TokenType.INDENT)) {
    state.advance(); // skip INDENT
    const lines: string[] = [];
    while (state.current && !state.isAt(TokenType.DEDENT)) {
      const tok = state.current;
      if (tok.type === TokenType.TEXT) {
        lines.push(tok.value);
        state.advance();
      } else if (tok.type === TokenType.NEWLINE) {
        state.advance();
      } else {
        // Unexpected token in filter body — break to avoid infinite loop
        break;
      }
    }
    // Consume DEDENT
    if (state.isAt(TokenType.DEDENT)) {
      state.advance();
    }
    if (lines.length > 0) {
      content = (content ? content + '\n' : '') + lines.join('\n');
    }
  }

  return new Filter(filterName, content, token.location);
}

// ─── Doctype ───────────────────────────────────────────────

function parseDoctype(state: ParserState): Doctype {
  const token = state.expect(TokenType.DOCTYPE);
  return new Doctype(token.value || 'html', token.location);
}

// ─── Text ──────────────────────────────────────────────────

function parseText(state: ParserState): Text {
  const token = state.expect(TokenType.TEXT);
  return new Text(token.value, token.location);
}

// ─── Attribute Block Parser ────────────────────────────────

/** Parse a CoffeeScript object literal into attributes.
 *  Uses a simple key-value parser that handles:
 *    {key: value, key2: value2}
 *    {shorthand}
 *    {key: "string", 'quoted-key': val, nested: {a: 1}}
 */
function parseAttributeBlock(
  source: string,
  _style: '{}' | '()',
  _location?: SourceLocation
): Attribute[] {
  const attrs: Attribute[] = [];
  if (!source.trim()) return attrs;

  // Simple attribute parser: split on commas outside of brackets/strings
  const pairs = splitAttributePairs(source);

  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (!trimmed) continue;

    const colonIdx = findColon(trimmed);
    if (colonIdx === -1) {
      // Shorthand: {foo} → foo={foo}
      attrs.push({
        name: trimmed,
        value: new Expression(trimmed),
        shorthand: true,
      });
    } else {
      const name = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();
      // Strip quotes from key if present
      const cleanName = name.replace(/^['"]|['"]$/g, '');
      attrs.push({
        name: cleanName,
        value: new Expression(value),
        shorthand: false,
      });
    }
  }

  return attrs;
}

/** Split attribute string on commas, respecting nested brackets and string literals. */
function splitAttributePairs(source: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    else if ((ch === '"' || ch === "'") && depth === 0) {
      // Skip over string literals
      const q = ch;
      i++;
      while (i < source.length && source[i] !== q) {
        if (source[i] === '\\') i++;
        i++;
      }
    }
    else if (ch === ',' && depth === 0) {
      result.push(source.slice(start, i));
      start = i + 1;
    }
  }

  result.push(source.slice(start));
  return result;
}

/** Find the first colon that is not inside brackets or strings. */
function findColon(source: string): number {
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    else if ((ch === '"' || ch === "'") && depth === 0) {
      const q = ch;
      i++;
      while (i < source.length && source[i] !== q) {
        if (source[i] === '\\') i++;
        i++;
      }
    }
    else if (ch === ':' && depth === 0) {
      return i;
    }
  }
  return -1;
}