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

# ─── Convert var → const/let ───────────────────────────────

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

  body = stmts.filter (s, i) -> i isnt varIdx

  assignments = []
  for name in varNames
    idx = body.findIndex (s) ->
      t = s.trim()
      t.startsWith("#{name} =") or t.startsWith("#{name}=")
    if idx >= 0
      assign = collapseWs(body[idx]).replace(/;\s*$/, '')
      assignments.push 'const ' + assign

  if assignments.length > 0
    return assignments.join '; '

  body.map((s) -> collapseWs s).join ' '

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