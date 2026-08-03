import { SourceLocation } from './types.js';

// ─── Token Types ───────────────────────────────────────────

export enum TokenType {
  TAG          = 'TAG',            // %tagname
  CLASS        = 'CLASS',          // .classname
  ID           = 'ID',             // #idname
  ATTRS_PAREN  = 'ATTRS_PAREN',    // (attr: val, ...)
  ATTRS_BRACE  = 'ATTRS_BRACE',    // {attr: val, ...}
  OUTPUT       = 'OUTPUT',         // = expression
  OUTPUT_UNESC = 'OUTPUT_UNESC',   // != expression
  CONTROL      = 'CONTROL',        // - keyword expression
  COMMENT      = 'COMMENT',        // -# comment
  HTML_COMMENT = 'HTML_COMMENT',   // / comment
  FILTER       = 'FILTER',         // :filtername
  DOCTYPE      = 'DOCTYPE',        // !!! doctype
  TEXT         = 'TEXT',           // plain text content
  PROLOGUE     = 'PROLOGUE',       // raw JS before first HAML construct
  INDENT       = 'INDENT',         // increase indentation
  DEDENT       = 'DEDENT',         // decrease indentation
  NEWLINE      = 'NEWLINE',        // line break
  SELF_CLOSE   = 'SELF_CLOSE',     // trailing / on element
}

// ─── Token ─────────────────────────────────────────────────

export interface Token {
  type: TokenType;
  value: string;
  location: SourceLocation;
  /** For INDENT/DEDENT: the indent level as a number. */
  indent?: number;
}

// ─── Lexer ─────────────────────────────────────────────────

export function tokenize(source: string, filename?: string): Token[] {
  const tokens: Token[] = [];
  const lines = source.split('\n');
  const indentStack: number[] = [0]; // level 0 is always on the stack

  let offset = 0;
  let inPrologue = true; // true until first HAML construct encountered

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    const lineLength = rawLine.length + 1; // +1 for \n (used only for offset)

    // Skip empty lines (but preserve their space for offset tracking)
    if (line.trim() === '') {
      offset += lineLength;
      continue;
    }

    const indent = countIndent(line);
    const content = line.slice(indent);

    // Skip blank lines
    if (content === '') {
      offset += lineLength;
      continue;
    }

    // ── Prologue detection: non-indented JS lines before first HAML construct ──
    if (inPrologue && indent === 0 && !isHamlConstruct(content)) {
      tokens.push({
        type: TokenType.PROLOGUE,
        value: content,
        location: {
          start: { line: 0, column: offset + indent },
          end: { line: 0, column: offset + indent + content.length },
          offset: offset + indent,
          length: lineLength - indent,
          file: filename,
        },
      });
      offset += lineLength;
      continue;
    }
    inPrologue = false; // first HAML construct or indented line locks us out of prologue

    // Handle indentation changes
    const currentIndent = indentStack[indentStack.length - 1];

    if (indent > currentIndent) {
      indentStack.push(indent);
      tokens.push(indentToken(indent, offset, indent, filename));
    } else if (indent < currentIndent) {
      while (indentStack.length > 1 && indent < indentStack[indentStack.length - 1]) {
        indentStack.pop();
        tokens.push(dedentToken(offset, filename));
      }
      if (indent !== indentStack[indentStack.length - 1]) {
        // Misaligned indent — still emit what we can
        indentStack.push(indent);
        tokens.push(indentToken(indent, offset, indent, filename));
      }
    }

    // Parse the line content
    const lineStartOffset = offset + indent;
    const lineTokens = tokenizeLine(content, lineStartOffset, lineLength - indent, filename);
    tokens.push(...lineTokens);

    offset += lineLength;
  }

  // Emit remaining DEDENT tokens at EOF
  while (indentStack.length > 1) {
    indentStack.pop();
    tokens.push(dedentToken(offset, filename));
  }

  return tokens;
}

// ─── Line Tokenization ─────────────────────────────────────

function tokenizeLine(
  content: string,
  lineStartOffset: number,
  _lineLength: number,
  filename?: string
): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  function loc(start: number, end: number): SourceLocation {
    return {
      start: { line: 0, column: lineStartOffset + start }, // line filled by tokenize() context
      end: { line: 0, column: lineStartOffset + end },
      offset: lineStartOffset + start,
      length: end - start,
      file: filename,
    };
  }

  const firstChar = content[0];

  // ── %tag ──
  if (firstChar === '%') {
    let end = 1;
    // Read tag name: letters, digits, hyphens, underscores
    while (end < content.length && /[\w-]/.test(content[end])) {
      end++;
    }
    const tagName = content.slice(1, end);
    tokens.push({ type: TokenType.TAG, value: tagName, location: loc(0, end) });
    pos = end;

    // Check for self-closing /
    if (content[pos] === '/') {
      tokens.push({ type: TokenType.SELF_CLOSE, value: '/', location: loc(pos, pos + 1) });
      pos++;
    }

    // Parse modifiers and attributes on the rest of the line
    const modResult = parseModifiersAndAttrs(content, pos, lineStartOffset, filename);
    tokens.push(...modResult.tokens);
    pos = modResult.pos;

    // Parse inline output or text after tag and attributes
    const remaining = content.slice(pos).trimStart();
    const trimmedOffset = content.length - remaining.length;
    if (remaining) {
      if (remaining.startsWith('= ') || remaining === '=') {
        tokens.push({ type: TokenType.OUTPUT, value: remaining.slice(1).trimStart(), location: loc(trimmedOffset + 1, content.length) });
      } else if (remaining.startsWith('!= ')) {
        tokens.push({ type: TokenType.OUTPUT_UNESC, value: remaining.slice(2).trimStart(), location: loc(trimmedOffset + 2, content.length) });
      } else if (!remaining.startsWith('{') && !remaining.startsWith('(')) {
        tokens.push({
          type: TokenType.TEXT,
          value: remaining,
          location: loc(trimmedOffset, content.length),
        });
      }
    }

    return tokens;
  }

  // ── .class / #id (implicit div) ──
  // Only match if the modifier is immediately followed by a valid identifier char.
  // This prevents `# Hello` (Markdown heading) or `. something` from being
  // mistakenly parsed as modifiers inside filter blocks.
  if ((firstChar === '.' || firstChar === '#') && /^[.#][\w-]/.test(content)) {
    const modResult = parseModifiersAndAttrs(content, 0, lineStartOffset, filename);
    tokens.push(...modResult.tokens);
    let pos = modResult.pos;

    // Parse inline output or text after modifiers (same as %tag path)
    const remaining = content.slice(pos).trimStart();
    const trimmedOffset = content.length - remaining.length;
    if (remaining) {
      if (remaining.startsWith('= ') || remaining === '=') {
        tokens.push({ type: TokenType.OUTPUT, value: remaining.slice(1).trimStart(), location: loc(trimmedOffset + 1, content.length) });
      } else if (remaining.startsWith('!= ')) {
        tokens.push({ type: TokenType.OUTPUT_UNESC, value: remaining.slice(2).trimStart(), location: loc(trimmedOffset + 2, content.length) });
      } else if (!remaining.startsWith('{') && !remaining.startsWith('(')) {
        tokens.push({
          type: TokenType.TEXT,
          value: remaining,
          location: loc(trimmedOffset, content.length),
        });
      }
    }

    return tokens;
  }

  // ── = expression ──
  if (firstChar === '=' && content[1] !== '=') {
    const expr = content.slice(1).trimStart();
    return [{ type: TokenType.OUTPUT, value: expr, location: loc(1, content.length) }];
  }

  // ── != expression ──
  if (firstChar === '!' && content[1] === '=') {
    const expr = content.slice(2).trimStart();
    return [{ type: TokenType.OUTPUT_UNESC, value: expr, location: loc(2, content.length) }];
  }

  // ── - control / comment ──
  if (firstChar === '-') {
    if (content[1] === '#') {
      // Haml comment
      return [{ type: TokenType.COMMENT, value: content.slice(2).trimStart(), location: loc(2, content.length) }];
    }
    // Control flow or code
    const expr = content.slice(1).trimStart();
    return [{ type: TokenType.CONTROL, value: expr, location: loc(1, content.length) }];
  }

  // ── / HTML comment ──
  if (firstChar === '/') {
    return [{ type: TokenType.HTML_COMMENT, value: content.slice(1).trimStart(), location: loc(1, content.length) }];
  }

  // ── :filter ──
  if (firstChar === ':') {
    const spaceIdx = content.search(/\s/);
    const filterName = spaceIdx === -1 ? content.slice(1) : content.slice(1, spaceIdx);
    const filterContent = spaceIdx === -1 ? '' : content.slice(spaceIdx + 1);
    return [{ type: TokenType.FILTER, value: `${filterName}\n${filterContent}`, location: loc(0, content.length) }];
  }

  // ── !!! doctype ──
  if (content.startsWith('!!!')) {
    const val = content.slice(3).trimStart();
    return [{ type: TokenType.DOCTYPE, value: val || 'html', location: loc(0, content.length) }];
  }

  // ── Plain text ──
  return [{ type: TokenType.TEXT, value: content, location: loc(0, content.length) }];
}

// ─── Modifiers and Attributes Parser ───────────────────────

function parseModifiersAndAttrs(
  content: string,
  startPos: number,
  lineStartOffset: number,
  filename?: string
): { tokens: Token[]; pos: number } {
  const tokens: Token[] = [];
  let pos = startPos;

  function loc(start: number, end: number): SourceLocation {
    return {
      start: { line: 0, column: lineStartOffset + start },
      end: { line: 0, column: lineStartOffset + end },
      offset: lineStartOffset + start,
      length: end - start,
      file: filename,
    };
  }

  while (pos < content.length) {
    const ch = content[pos];

    // Whitespace
    if (ch === ' ' || ch === '\t') {
      pos++;
      continue;
    }

    // .class
    if (ch === '.') {
      let end = pos + 1;
      while (end < content.length && /[\w-]/.test(content[end])) {
        end++;
      }
      const className = content.slice(pos + 1, end);
      tokens.push({ type: TokenType.CLASS, value: className, location: loc(pos, end) });
      pos = end;
      continue;
    }

    // #id
    if (ch === '#') {
      let end = pos + 1;
      while (end < content.length && /[\w-]/.test(content[end])) {
        end++;
      }
      const idName = content.slice(pos + 1, end);
      tokens.push({ type: TokenType.ID, value: idName, location: loc(pos, end) });
      pos = end;
      continue;
    }

    // {attribute block}
    if (ch === '{') {
      const block = extractBracketed(content, pos, '{', '}');
      if (block) {
        tokens.push({ type: TokenType.ATTRS_BRACE, value: block, location: loc(pos, pos + block.length + 2) });
        pos += block.length + 2;
      } else {
        // Unterminated — consume rest
        tokens.push({ type: TokenType.ATTRS_BRACE, value: content.slice(pos + 1), location: loc(pos, content.length) });
        pos = content.length;
      }
      continue;
    }

    // (attribute block)
    if (ch === '(') {
      const block = extractBracketed(content, pos, '(', ')');
      if (block) {
        tokens.push({ type: TokenType.ATTRS_PAREN, value: block, location: loc(pos, pos + block.length + 2) });
        pos += block.length + 2;
      } else {
        tokens.push({ type: TokenType.ATTRS_PAREN, value: content.slice(pos + 1), location: loc(pos, content.length) });
        pos = content.length;
      }
      continue;
    }

    // Anything else → stop, it's inline text
    break;
  }

  return { tokens, pos };
}

// ─── Helpers ───────────────────────────────────────────────

/** Returns true if a line of content starts a HAML construct (not plain text). */
function isHamlConstruct(content: string): boolean {
  const fc = content[0];
  return fc === '%' || fc === '.' || fc === '#' || fc === '=' ||
         fc === '-' || fc === '/' || fc === ':' ||
         (fc === '!' && content[1] === '=') ||
         content.startsWith('!!!');
}

function countIndent(line: string): number {
  let count = 0;
  for (const ch of line) {
    if (ch === ' ') count++;
    else if (ch === '\t') count += 2; // tab = 2 spaces
    else break;
  }
  return count;
}

function indentToken(_indent: number, offset: number, level: number, filename?: string): Token {
  return {
    type: TokenType.INDENT,
    value: '',
    indent: level,
    location: {
      start: { line: 0, column: 0 },
      end: { line: 0, column: 0 },
      offset,
      length: 0,
      file: filename,
    },
  };
}

function dedentToken(offset: number, filename?: string): Token {
  return {
    type: TokenType.DEDENT,
    value: '',
    indent: undefined,
    location: {
      start: { line: 0, column: 0 },
      end: { line: 0, column: 0 },
      offset,
      length: 0,
      file: filename,
    },
  };
}

/** Extract content between balanced open/close brackets. Returns inner content or null. */
function extractBracketed(
  content: string,
  start: number,
  open: string,
  close: string
): string | null {
  let depth = 0;
  let pos = start;
  while (pos < content.length) {
    if (content[pos] === open) depth++;
    else if (content[pos] === close) {
      depth--;
      if (depth === 0) return content.slice(start + 1, pos);
    }
    // Handle string literals — skip over them
    if (content[pos] === '"' || content[pos] === "'") {
      const q = content[pos];
      pos++;
      while (pos < content.length && content[pos] !== q) {
        if (content[pos] === '\\') pos++; // skip escape
        pos++;
      }
    }
    pos++;
  }
  return null; // unbalanced
}