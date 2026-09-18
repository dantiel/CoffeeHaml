# expressions.coffee — CoffeeScript expression compilation bridge

import { createRequire } from 'module'
import { Expression } from './ast.js'
import { CompileError } from './types.js'

# ESM-safe CoffeeScript loader
_require = createRequire import.meta.url

loadCoffeeScript = ->
  try _require 'coffeescript' catch then null

# ─── Availability check ────────────────────────────────────

_coffeeScriptAvailable = null
_coffeeScriptUnavailableReason = ''

checkCoffeeScript = ->
  return _coffeeScriptAvailable if _coffeeScriptAvailable isnt null
  try
    cs = loadCoffeeScript()
    if cs and typeof cs.compile is 'function'
      _coffeeScriptAvailable = true
      return true
    _coffeeScriptAvailable = false
    _coffeeScriptUnavailableReason = 'CoffeeScript module loaded but has no compile() function'
    return false
  catch e
    _coffeeScriptAvailable = false
    _coffeeScriptUnavailableReason = "CoffeeScript unavailable: #{if e instanceof Error then e.message else String e}"
    return false

export isCoffeeScriptAvailable = -> checkCoffeeScript()

export getCoffeeScriptUnavailableReason = ->
  checkCoffeeScript()
  _coffeeScriptUnavailableReason

# ─── Parse expression ──────────────────────────────────────

export parseExpression = (source) ->
  expr = new Expression source
  try
    CoffeeScript = loadCoffeeScript()
    if CoffeeScript and typeof CoffeeScript.parse is 'function'
      expr.parsed = CoffeeScript.parse source, bare: true
  catch
    # Parse error — store raw source
  expr

# ─── Compile expression to JS ──────────────────────────────

export compileExpression = (expr, location = null) ->
  return '' if expr.source.trim() is ''

  try
    CoffeeScript = loadCoffeeScript()
    if CoffeeScript and typeof CoffeeScript.compile is 'function'
      js = CoffeeScript.compile expr.source,
        bare: true
        inlineMap: false
      return stripCoffeeWrapper js, expr.source
  catch e
    msg = if e instanceof Error then e.message else String e
    if location
      throw new CompileError(
        "CoffeeScript expression error: #{msg}"
        'emitter'
        'EXPRESSION_ERROR'
        location
        "Check expression: #{expr.source.slice 0, 80}"
      )
  expr.source

# ─── Strip CoffeeScript wrapper ────────────────────────────

stripCoffeeWrapper = (js, _original) ->
  result = js.trim()
  result = result.replace /;\s*$/, ''

  lines = (l for l in result.split '\n' when l.trim() isnt '')
  if lines.length > 0
    varLines = (l for l in lines when /^\s*var\b/.test l)
    meaningful = (l for l in lines when not /^\s*var\b/.test l)

    if meaningful.length > 0
      if varLines.length > 0
        body = meaningful.join ' '
        return "(() => { #{varLines.join ' '} return #{body}; })()"
      return meaningful.join '\n'
    return lines[lines.length - 1]

  result

# ─── Compile statement to JS ───────────────────────────────

export compileStatement = (source, location = null) ->
  try
    CoffeeScript = loadCoffeeScript()
    if CoffeeScript and typeof CoffeeScript.compile is 'function'
      js = CoffeeScript.compile source,
        bare: true
        inlineMap: false
      return stripToConst js.trim()
  catch e
    msg = if e instanceof Error then e.message else String e
    if location
      throw new CompileError(
        "CoffeeScript compilation error: #{msg}"
        'emitter'
        'COMPILE_ERROR'
        location
        "Check statement: #{source.slice 0, 80}"
      )
  source

# ─── Compile yield block to JS expression ──────────────────
# Compiles a fenced `=== ... ===` body to a single JS expression whose
# value is the body's final result (the multiline counterpart to `=`).
# A single expression compiles cleanly; multiple statements are wrapped
# in an IIFE so CoffeeScript's implicit return becomes the yielded value.

export compileYield = (source, location = null) ->
  return '' if source.trim() is ''

  try
    CoffeeScript = loadCoffeeScript()
    unless CoffeeScript and typeof CoffeeScript.compile is 'function'
      return source

    if isSingleExpression source
      return compileExpression new Expression(source), location

    indented = source.replace /^/gm, '  '
    wrapped = "(->\n#{indented}\n)()"
    js = CoffeeScript.compile wrapped,
      bare: true
      inlineMap: false
    return collapseWs(js.trim()).replace(/;\s*$/, '')
  catch e
    msg = if e instanceof Error then e.message else String e
    if location
      throw new CompileError(
        "CoffeeScript yield error: #{msg}"
        'emitter'
        'YIELD_ERROR'
        location
        "Check block: #{source.slice 0, 80}"
      )
  source

isSingleExpression = (source) ->
  try
    CoffeeScript = loadCoffeeScript()
    if CoffeeScript and typeof CoffeeScript.nodes is 'function'
      root = CoffeeScript.nodes source
      return root?.body?.expressions?.length is 1
  catch
    false
  false

# ─── Convert var → const/let ───────────────────────────────

# Extract the bound variable name from one entry of an object
# destructuring pattern — shorthand `x` stays `x`, aliased `key: target`
# yields `target`.
objectTarget = (pair) ->
  pair = pair.trim()
  if pair.includes ':'
    pair.split(':')[1].trim()
  else
    pair

stripToConst = (js) ->
  stmts = splitTopLevelStatements js
  return js.replace(/;\s*$/, '') if stmts.length is 0

  varIdx = stmts.findIndex (s) -> /^\s*var\b/.test s
  return js.replace(/;\s*$/, '') if varIdx < 0

  varNames = stmts[varIdx]
    .replace(/^\s*var\s+/, '')
    .replace(/;\s*$/, '')
    .split ','
    .map (s) -> s.trim()
    .filter Boolean

  body = (collapseWs(s).replace(/;\s*$/, '') for s in stmts.filter (s, i) -> i isnt varIdx)

  constReplacements = {}
  consumed = []
  for s, idx in body
    m = s.match /^\[([^\]]*)\]\s*=/
    if m?
      # Array destructuring: [a, b] = expr
      names = (n.trim() for n in m[1].split ',' when n.trim())
      consumed = consumed.concat names
      constReplacements[idx] = 'const ' + s
      continue

    m = s.match /^\(\s*\{([^}]*)\}\s*=.*\)$/
    if m?
      # Object destructuring: ({x, y} = expr) -> const {x, y} = expr
      inner = s.replace(/^\s*\(\s*/, '').replace(/\s*\)\s*$/, '')
      names = (objectTarget(n) for n in m[1].split ',' when n.trim())
      consumed = consumed.concat names
      constReplacements[idx] = 'const ' + inner
      continue

    name = varNames.find (n) -> s.startsWith("#{n} =") or s.startsWith("#{n}=")
    if name?
      consumed.push name
      constReplacements[idx] = 'const ' + s

  allConsumed = varNames.every (n) -> n in consumed
  if allConsumed and Object.keys(constReplacements).length > 0
    # Preserve non-assignment statements (imports, calls, declarations)
    # in their original order, converting only bound assignments to const.
    return (constReplacements[idx] ? s for s, idx in body).join '; '

  # Fallback: keep the original var declaration so no variable goes
  # undeclared (e.g. chained assignment `a = b = 1`).
  (collapseWs(s).replace(/;\s*$/, '') for s in stmts).join '; '

# Split compiled JS into top-level statements, respecting string literals
# and bracket nesting so multiline object/array/call literals stay intact.
splitTopLevelStatements = (js) ->
  stmts = []
  depth = 0
  inString = null
  start = 0
  i = 0
  while i < js.length
    ch = js[i]
    if inString
      if ch is '\\'
        i += 2
        continue
      inString = null if ch is inString
      i++
      continue
    if ch in ["'", '"', '`']
      inString = ch
    else if ch in ['{', '[', '(']
      depth++
    else if ch in ['}', ']', ')']
      depth--
    else if ch is ';' and depth is 0
      stmts.push js.slice(start, i).trim()
      start = i + 1
    i++
  last = js.slice(start).trim()
  stmts.push last if last
  stmts

# Collapse runs of whitespace to single spaces, preserving string contents.
collapseWs = (s) ->
  out = ''
  inString = null
  pendingSpace = false
  i = 0
  while i < s.length
    ch = s[i]
    if inString
      out += ch
      if ch is '\\' and i + 1 < s.length
        out += s[i + 1]
        i += 2
        continue
      inString = null if ch is inString
      i++
      continue
    if ch in ["'", '"', '`']
      out += ' ' if pendingSpace and out.length
      pendingSpace = false
      inString = ch
      out += ch
      i++
      continue
    if /\s/.test ch
      pendingSpace = true
    else
      out += ' ' if pendingSpace and out.length
      pendingSpace = false
      out += ch
    i++
  out