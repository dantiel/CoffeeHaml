# coffeescript-formatter.coffee — CoffeeScript token-based expression formatter

import { createRequire } from 'module'

_require = createRequire import.meta.url

loadCoffeeScript = ->
  try _require 'coffeescript' catch then null

# ─── Token types ──────────────────────────────────────────
# CSToken: { type, value, range, generated?, originalText? }

# ─── Spacing categories ───────────────────────────────────

NO_SPACE_BEFORE = new Set [
  ',', ':', ';', '.', '?.', '::'
  ')', ']', '}'
  'CALL_END', 'PARAM_END', 'INDEX_END'
  'POST_IF', 'POST_FOR', 'POST_WHILE'
  'TERMINATOR'
]

NO_SPACE_AFTER = new Set [
  '.', '?.', '::', '...', '..'
  '(', '[', '{'
  'CALL_START', 'PARAM_START', 'INDEX_START'
  'STRING_START', 'INTERPOLATION_START'
  'INDENT', '@'
]

SPACE_AFTER = new Set [',', ':']

SPACE_BOTH = new Set [
  '=', '?='
  '+', '-'
  'MATH'
  '**'
  'SHIFT'
  '&', '|', '^'
  '&&', '||', '?'
  '=>', '->'
  'COMPARE'
  'COMPOUND_ASSIGN'
  'RELATION'
  'FOR'
  'ELSE', 'IF', 'WHILE'
]

KEYWORD_SPACE_AFTER = new Set [
  'RETURN', 'THROW', 'NEW', 'TYPEOF', 'INSTANCEOF', 'DELETE'
  'CLASS', 'EXTENDS', 'DEFAULT', 'IMPORT', 'EXPORT', 'AWAIT'
  'YIELD', 'BREAK', 'CONTINUE', 'SWITCH'
]

FOR_KEYWORDS = new Set ['FORIN', 'FOROF', 'WHEN', 'BY']

EXPR_STARTERS = new Set [
  '(', '[', '{', ',', ':'
  '=', '?='
  '+', '-', 'MATH', '**', 'SHIFT'
  '&', '|', '^'
  '&&', '||', '?'
  '=>', '->'
  'COMPARE', 'COMPOUND_ASSIGN'
  'RETURN', 'INDENT', 'OUTDENT', 'TERMINATOR', 'FOR', 'FORIN', 'FOROF'
  'WHILE', 'IF', 'ELSE', 'THROW', 'NEW', 'TYPEOF', 'INSTANCEOF'
  'DELETE', 'EXTENDS', 'DEFAULT'
  'CALL_START', 'PARAM_START', 'INDEX_START'
  'UNARY'
]

DEFAULT_OPTS =
  printWidth: 80
  methodChainAlign: true
  enabled: true

# ─── Public API ───────────────────────────────────────────

export formatCoffeeScript = (source, options = {}) ->
  opts = {DEFAULT_OPTS..., options...}
  return source unless opts.enabled
  return source unless source and source.trim() isnt ''

  try
    cs = loadCoffeeScript()
    return source unless cs and typeof cs.tokens is 'function'

    rawTokens = cs.tokens source
    return source unless rawTokens and rawTokens.length > 0

    tokens = rawTokens.map (t) ->
      type: t[0]
      value: t[1]
      range: t[2]?.range ? [0, 0]
      generated: !!t[2]?.generated
      originalText: if t[2]?.range and t[2].range[0] < t[2].range[1]
        source.slice t[2].range[0], t[2].range[1]
      else
        t[1]

    return source if hasImplicitTokens tokens

    normalized = normalizeSpacing tokens, source

    if normalized.length > opts.printWidth
      return lineWrap normalized, opts, source

    normalized
  catch
    source

# ─── Block formatting ─────────────────────────────────────

export formatCoffeeScriptBlock = (source, options = {}) ->
  opts = {DEFAULT_OPTS..., options...}
  return source unless opts.enabled
  return source unless source and source.trim() isnt ''

  lines = source.split '\n'
  formatted = lines.map (line) ->
    trimmed = line.trim()
    return '' unless trimmed
    leading = line.match(/^(\s*)/)?[1] ? ''
    try
      formattedExpr = formatCoffeeScript trimmed, options
      leading + formattedExpr
    catch
      line

  formatted.join '\n'

# ─── Implicit token detection ─────────────────────────────

hasImplicitTokens = (tokens) ->
  for t in tokens
    continue if t.type in ['INDENT', 'OUTDENT', 'TERMINATOR']
    return true if t.generated
    return true if t.range and t.range[0] >= t.range[1]
  false

# ─── Spacing normalization ────────────────────────────────

normalizeSpacing = (tokens, originalSource = null) ->
  parts = []
  prevVisible = null
  prevWasAtExprStart = true
  afterPrevIsExprStart = true

  for cur in tokens
    # Skip implicit CALL/PARAM tokens
    if cur.type in ['CALL_START', 'CALL_END']
      continue if cur.generated
      continue if cur.range and cur.range[0] >= cur.range[1]
    if cur.type in ['PARAM_START', 'PARAM_END']
      continue if cur.generated
      continue if cur.range and cur.range[0] >= cur.range[1]

    # Skip INDENT/OUTDENT
    if cur.type in ['INDENT', 'OUTDENT']
      continue

    # Skip TERMINATOR
    if cur.type is 'TERMINATOR'
      continue

    # Space before this token
    if prevVisible and prevVisible.type not in ['INDENT', 'OUTDENT']
      if needsSpaceBetween prevVisible, cur, prevWasAtExprStart
        parts.push ' '

    parts.push getTokenText cur, originalSource

    prevWasAtExprStart = afterPrevIsExprStart
    afterPrevIsExprStart = EXPR_STARTERS.has cur.type
    prevVisible = cur

  parts.join ''

getTokenText = (token, originalSource = null) ->
  return token.value if token.generated
  return token.value unless token.range and token.range[0] < token.range[1]
  return originalSource.slice(token.range[0], token.range[1]) if originalSource
  token.value

needsSpaceBetween = (prev, cur, prevAtExprStart) ->
  return false if NO_SPACE_AFTER.has prev.type
  return false if NO_SPACE_BEFORE.has cur.type
  return false if prev.type is '@'

  return true if SPACE_AFTER.has prev.type
  return true if FOR_KEYWORDS.has(prev.type) or FOR_KEYWORDS.has(cur.type)
  return true if KEYWORD_SPACE_AFTER.has prev.type

  if prev.type is 'UNARY'
    text = prev.originalText or prev.value
    return false if text in ['!', '!!']
    return true

  if SPACE_BOTH.has(prev.type) or SPACE_BOTH.has(cur.type)
    return false if isUnaryOp prev, prevAtExprStart
    return true

  return true if prev.type is 'IDENTIFIER' and cur.type is 'IDENTIFIER'

  false

isUnaryOp = (prev, prevAtExprStart) ->
  return false unless prev.type in ['+', '-']
  return true if prevAtExprStart
  return true if prev.range and prev.range[0] is 0
  false

# ─── Line wrapping ────────────────────────────────────────

lineWrap = (source, opts, fallback) ->
  if opts.methodChainAlign and hasMethodChain source
    return wrapMethodChain source, opts
  fallback

hasMethodChain = (source) ->
  (source.match(/\.[a-zA-Z_$]/g) or []).length >= 2

wrapMethodChain = (source, _opts) ->
  indent = '  '
  result = []
  chars = [...source]
  depth = 0
  current = ''
  i = 0

  while i < chars.length
    ch = chars[i]

    depth++ if ch in ['(', '[', '{']
    depth-- if ch in [')', ']', '}']

    if ch is '.' and depth is 0 and i > 0 and chars[i - 1] isnt '?' and current.trim().length > 0
      if result.length is 0
        result.push current.trimEnd()
      else
        result.push indent + current.trimEnd()
      current = ch
      i++
      continue

    current += ch
    i++

  if current.trim().length > 0
    if result.length is 0
      result.push current.trim()
    else
      result.push indent + current.trim()

  if result.length > 1 then result.join '\n' else source
