/**
 * CoffeeScript Token-Based Formatter
 *
 * Normalizes whitespace and wraps long lines in CoffeeScript expressions
 * embedded within CoffeeHaml templates. Uses CoffeeScript's own lexer
 * (`CoffeeScript.tokens()`) for robust tokenization. Falls back to
 * original source on any parse error.
 *
 * Approach:
 *   Phase 1: Tokenize with CoffeeScript's lexer
 *   Phase 2: Normalize spacing based on token categories
 *   Phase 3: Line-wrap expressions exceeding printWidth
 *   Fallback: Return original source on any error
 */

import { createRequire } from 'module';

const _require = createRequire(import.meta.url);

function loadCoffeeScript(): any {
  try {
    return _require('coffeescript');
  } catch {
    return null;
  }
}

// ─── Token types ──────────────────────────────────────────

interface CSToken {
  type: string;
  value: string;        // CoffeeScript token value (may differ from source)
  range: [number, number];
  generated?: boolean;
  originalText?: string; // Original source text (set during mapping)
}

// ─── Spacing categories ───────────────────────────────────

// ──────────────────────────────────────────────────────────
// NOTE: Spacing rules use CoffeeScript token TYPES, not values.
// CoffeeScript categorizes operators into type groups:
//   * / %     → MATH
//   << >> >>> → SHIFT
//   == != < > → COMPARE
//   is isnt   → COMPARE (rewritten to ==, !=)
//   and or    → &&, ||  (rewritten)
//   not       → UNARY    (rewritten to !)
//   += -= etc → COMPOUND_ASSIGN
//   + -       → + - (same type as value)
// We use original source text for output but token types for spacing.
// ──────────────────────────────────────────────────────────

/** Tokens that should NOT have a space before them. */
const NO_SPACE_BEFORE = new Set([
  ',', ':', ';', '.', '?.', '::',
  ')', ']', '}',
  'CALL_END', 'PARAM_END', 'INDEX_END',
  'POST_IF', 'POST_FOR', 'POST_WHILE',
  'TERMINATOR',
  // NOTE: FORIN, FOROF removed — they need space before them
]);

/** Tokens that should NOT have a space after them. */
const NO_SPACE_AFTER = new Set([
  '.', '?.', '::', '...', '..',
  '(', '[', '{',
  'CALL_START', 'PARAM_START', 'INDEX_START',
  'STRING_START', 'INTERPOLATION_START',
  'INDENT', '@',
  // UNARY removed — we handle it in needsSpaceBetween based on original text
]);

/** Tokens that ALWAYS get a space after them. */
const SPACE_AFTER = new Set([
  ',',       // comma in args/arrays
  ':',       // colon in object literals
]);

/** Binary operators that get spaces on both sides.
 *  Uses CoffeeScript token TYPES (MATH, SHIFT, COMPARE, etc.). */
const SPACE_BOTH = new Set([
  '=', '?=',
  '+', '-',           // simple arithmetic (unary handled separately)
  'MATH',             // * / %
  '**',               // power
  'SHIFT',            // << >> >>>
  '&', '|', '^',     // bitwise
  '&&', '||', '?',   // logical
  '=>', '->',         // arrows
  'COMPARE',           // == != < > <= >= is isnt
  'COMPOUND_ASSIGN',   // += -= *= /= etc.
  'RELATION',          // in, of (when not FORIN/FOROF)
  'FOR',               // for (comprehension keyword)
  'ELSE', 'IF', 'WHILE', // control flow keywords
]);

/** Keywords that should have a space after them (but not before). */
const KEYWORD_SPACE_AFTER = new Set([
  'RETURN', 'THROW', 'NEW', 'TYPEOF', 'INSTANCEOF', 'DELETE',
  'CLASS', 'EXTENDS', 'DEFAULT', 'IMPORT', 'EXPORT', 'AWAIT',
  'YIELD', 'BREAK', 'CONTINUE', 'SWITCH',
]);

/** For-comprehension internal keywords get space on both sides. */
const FOR_KEYWORDS = new Set(['FORIN', 'FOROF', 'WHEN', 'BY']);

/** Tokens that start a new expression — after these, - and + are unary. */
const EXPR_STARTERS = new Set([
  '(', '[', '{', ',', ':',
  '=', '?=',
  '+', '-', 'MATH', '**', 'SHIFT',
  '&', '|', '^',
  '&&', '||', '?',
  '=>', '->',
  'COMPARE', 'COMPOUND_ASSIGN',
  'RETURN', 'INDENT', 'OUTDENT', 'TERMINATOR', 'FOR', 'FORIN', 'FOROF',
  'WHILE', 'IF', 'ELSE', 'THROW', 'NEW', 'TYPEOF', 'INSTANCEOF',
  'DELETE', 'EXTENDS', 'DEFAULT',
  'CALL_START', 'PARAM_START', 'INDEX_START',
  'UNARY',
]);

// ─── Formatting options ───────────────────────────────────

export interface CSFormatOptions {
  printWidth: number;
  methodChainAlign: boolean;
  /** If false, skip formatting entirely (return source as-is). */
  enabled: boolean;
}

const DEFAULT_OPTS: CSFormatOptions = {
  printWidth: 80,
  methodChainAlign: true,
  enabled: true,
};

// ─── Public API ───────────────────────────────────────────

/**
 * Format a CoffeeScript expression string.
 * Returns the formatted string or the original on error.
 */
export function formatCoffeeScript(
  source: string,
  options: Partial<CSFormatOptions> = {},
): string {
  const opts: CSFormatOptions = { ...DEFAULT_OPTS, ...options };

  if (!opts.enabled) return source;
  if (!source || source.trim() === '') return source;

  try {
    const cs = loadCoffeeScript();
    if (!cs || typeof cs.tokens !== 'function') return source;

    // CoffeeScript.tokens() returns tuples: [string, string, location]
    // Map them to our CSToken interface for easier access
    const rawTokens: any[] = cs.tokens(source);
    if (!rawTokens || rawTokens.length === 0) return source;

    const tokens: CSToken[] = rawTokens.map((t: any) => ({
      type: t[0],
      value: t[1],
      range: t[2]?.range ?? [0, 0],
      generated: !!t[2]?.generated,
      originalText: (t[2]?.range && t[2].range[0] < t[2].range[1])
        ? source.slice(t[2].range[0], t[2].range[1])
        : t[1],
    }));

    // Check for implicit/synthetic tokens that would make formatting unsafe.
    // If the expression has zero-width tokens (implicit calls, generated params),
    // fall back to original source to avoid changing semantics.
    if (hasImplicitTokens(tokens)) {
      return source;
    }

    // Phase 2: Normalize spacing (pass original source for text extraction)
    const normalized = normalizeSpacing(tokens, source);

    // Phase 3: Line-wrap if needed
    if (normalized.length > opts.printWidth) {
      return lineWrap(normalized, opts, source);
    }

    return normalized;
  } catch (e) {
    // On any error, return original source unchanged
    return source;
  }
}

/**
 * Check if the token stream contains implicit/synthetic tokens
 * (zero-width CALL/PARAM tokens) that indicate CoffeeScript
 * implicit function calls. Formatting these would change semantics.
 */
function hasImplicitTokens(tokens: CSToken[]): boolean {
  for (const t of tokens) {
    if (t.type === 'INDENT' || t.type === 'OUTDENT' || t.type === 'TERMINATOR') continue;
    if (t.generated) return true;
    if (t.range && t.range[0] >= t.range[1]) return true;
    // Check for CALL_START/CALL_END that aren't explicit parens:
    // If they're at same position as another token, they're implicit
  }
  return false;
}

// ─── Phase 2: Spacing normalization ──────────────────────

/**
 * Normalize whitespace in a token stream.
 * Uses original source text (from token ranges) for output
 * but CoffeeScript token TYPES for spacing decisions.
 * This preserves keywords like 'is', 'and', 'not' that
 * CoffeeScript rewrites internally.
 */
function normalizeSpacing(tokens: CSToken[], originalSource?: string): string {
  const parts: string[] = [];
  let prevVisible: CSToken | null = null;
  // Track whether prev was at expression start (for unary detection).
  // Starts true because the first token is at expression start.
  let prevWasAtExprStart = true;
  // Track whether the position AFTER prev starts an expression
  // (for the next token's unary detection).
  let afterPrevIsExprStart = true;

  for (let i = 0; i < tokens.length; i++) {
    const cur = tokens[i];
    
    // Skip implicit/synthetic call tokens:
    // - generated CALL_START/CALL_END
    // - zero-width CALL_START/CALL_END (CoffeeScript may not mark these as generated)
    if (cur.type === 'CALL_START' || cur.type === 'CALL_END') {
      if (cur.generated) continue;
      // Also skip if zero-width (implicit parens)
      if (cur.range && cur.range[0] >= cur.range[1]) continue;
    }
    // Also skip zero-width PARAM_START/PARAM_END (generated arrow params)
    if (cur.type === 'PARAM_START' || cur.type === 'PARAM_END') {
      if (cur.generated) continue;
      if (cur.range && cur.range[0] >= cur.range[1]) continue;
    }

    // INDENT/OUTDENT: skip output but track the previous real token
    // for spacing purposes (INDENT after => should not break the
    // space between => and the next token).
    if (cur.type === 'INDENT' || cur.type === 'OUTDENT') {
      // Don't update prevVisible — keep the last real token
      continue;
    }

    // TERMINATOR: skip entirely
    if (cur.type === 'TERMINATOR') {
      continue;
    }

    // Determine space before this token
    if (prevVisible && prevVisible.type !== 'INDENT' && prevVisible.type !== 'OUTDENT') {
      if (needsSpaceBetween(prevVisible, cur, prevWasAtExprStart)) {
        parts.push(' ');
      }
    }

    // Output token text: prefer original source, fall back to token value
    parts.push(getTokenText(cur, originalSource));

    // Update tracking for next iteration
    prevWasAtExprStart = afterPrevIsExprStart;
    afterPrevIsExprStart = EXPR_STARTERS.has(cur.type);
    prevVisible = cur;
  }

  return parts.join('');
}

/**
 * Get the original source text for a token.
 * CoffeeScript may rewrite token values (is→==, and→&&),
 * so we use the original source range when available.
 */
/**
 * Get the output text for a token.
 * Prefers original source text from the token's range,
 * but falls back to token value for zero-width ranges,
 * generated tokens, or when originalSource is unavailable.
 */
function getTokenText(token: CSToken, originalSource?: string): string {
  // For generated tokens, use the token value (e.g., '(' for CALL_START)
  if (token.generated) return token.value;

  // For zero-width ranges, use token value
  if (!token.range || token.range[0] >= token.range[1]) return token.value;

  // Use original source text
  if (originalSource) {
    return originalSource.slice(token.range[0], token.range[1]);
  }

  return token.value;
}

/**
 * Determine if a space is needed between two visible tokens.
 * @param prevAtExprStart true if the position BEFORE prev was at
 *   expression start — used to detect unary + / - operators.
 */
function needsSpaceBetween(prev: CSToken, cur: CSToken, prevAtExprStart: boolean): boolean {
  // No space after these token types (e.g., ., (, [, @)
  if (NO_SPACE_AFTER.has(prev.type)) return false;

  // No space before these token types (e.g., , : ; . ) ] })
  if (NO_SPACE_BEFORE.has(cur.type)) return false;

  // @property access: no space after @
  if (prev.type === '@') return false;

  // Tokens that always get a space after (comma, colon)
  if (SPACE_AFTER.has(prev.type)) return true;

  // For-comprehension keywords: space around FORIN, FOROF, WHEN, BY
  if (FOR_KEYWORDS.has(prev.type) || FOR_KEYWORDS.has(cur.type)) return true;

  // Keywords that take space after them (FOR, RETURN, THROW, etc.)
  if (KEYWORD_SPACE_AFTER.has(prev.type)) return true;

  // UNARY (! or not): no space after if the original text is !
  // (as opposed to the keyword 'not')
  if (prev.type === 'UNARY') {
    const text = prev.originalText || prev.value;
    if (text === '!' || text === '!!') return false;
    // For 'not' keyword: space after is desired
    return true;
  }

  // Binary operators: space on both sides
  if (SPACE_BOTH.has(prev.type) || SPACE_BOTH.has(cur.type)) {
    // If prev is + or - and is at expression start, it's unary — no space after it
    if (isUnaryOp(prev, prevAtExprStart)) return false;
    return true;
  }

  // Space between two identifiers (rare but possible)
  if (prev.type === 'IDENTIFIER' && cur.type === 'IDENTIFIER') return true;

  // Default: no extra space
  return false;
}

/**
 * Check if prev token is a unary + or - operator.
 * prevAtExprStart is the expression-start state BEFORE prev was processed.
 */
function isUnaryOp(prev: CSToken, prevAtExprStart: boolean): boolean {
  if (prev.type !== '+' && prev.type !== '-') return false;
  // At expression start (first token or after expression starter)
  if (prevAtExprStart) return true;
  // Also unary if at the very beginning (range[0] === 0)
  if (prev.range && prev.range[0] === 0) return true;
  return false;
}

// ─── Phase 3: Line wrapping ──────────────────────────────

function lineWrap(source: string, opts: CSFormatOptions, fallback: string): string {
  // Strategy: break at natural points
  // 1. Method chains: break after each .method
  // 2. Arrow functions: break after =>
  // 3. Binary expressions: break after operators
  // 4. Object literals: break after ,

  // For now, implement method chain wrapping (most common long-expression case)
  if (opts.methodChainAlign && hasMethodChain(source)) {
    return wrapMethodChain(source, opts);
  }

  // Fall back — source is already normalized, just too long
  return fallback;
}

function hasMethodChain(source: string): boolean {
  // Detect .method chains (not just a single .property)
  const dotCount = (source.match(/\.[a-zA-Z_$]/g) || []).length;
  return dotCount >= 2;
}

function wrapMethodChain(source: string, _opts: CSFormatOptions): string {
  // Break .method calls onto separate lines with aligned dots
  // But be careful not to break inside strings, parens, or brackets

  const indent = '  '.repeat(1); // 1 level of indentation for continuation
  const result: string[] = [];
  const chars = [...source];
  let depth = 0;
  let current = '';
  let i = 0;

  while (i < chars.length) {
    const ch = chars[i];

    // Track nesting depth
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth--;

    // Break before . at depth 0
    if (ch === '.' && depth === 0 && i > 0 && chars[i - 1] !== '?' && current.trim().length > 0) {
      if (result.length === 0) {
        // First segment
        result.push(current.trimEnd());
      } else {
        result.push(indent + current.trimEnd());
      }
      current = ch;
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  // Add remaining
  if (current.trim().length > 0) {
    if (result.length === 0) {
      result.push(current.trim());
    } else {
      result.push(indent + current.trim());
    }
  }

  return result.length > 1 ? result.join('\n') : source;
}

// ─── Batch formatting for embedded blocks ─────────────────

/**
 * Format a block of CoffeeScript code (multiple statements).
 * Used for Statement bodies, CoffeeScript filters, and prologue.
 */
export function formatCoffeeScriptBlock(
  source: string,
  options: Partial<CSFormatOptions> = {},
): string {
  const opts: CSFormatOptions = { ...DEFAULT_OPTS, ...options };
  if (!opts.enabled || !source || source.trim() === '') return source;

  // For blocks, format each line individually
  const lines = source.split('\n');
  const formatted = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    // Preserve leading whitespace for indentation
    const leading = line.match(/^(\s*)/)?.[1] ?? '';
    try {
      const formattedExpr = formatCoffeeScript(trimmed, options);
      return leading + formattedExpr;
    } catch {
      return line;
    }
  });

  return formatted.join('\n');
}