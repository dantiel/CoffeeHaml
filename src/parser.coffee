# parser.coffee — recursive descent parser
# Converts token stream into AST

import { TokenType } from './lexer.js'
import {
  Document, Element, ImplicitDiv, Text, Output, ControlFlow,
  Comment, Filter, Doctype, Expression, Attribute, SpreadAttribute
} from './ast.js'
import { CompileError } from './types.js'

# ─── Parser State ──────────────────────────────────────────

class ParserState
  tokens: []
  pos: 0
  filename: null
  errors: []

  constructor: (@tokens, @filename = null) ->
    @pos = 0
    @errors = []

  current: -> if @pos < @tokens.length then @tokens[@pos] else null

  peek:    -> if @pos + 1 < @tokens.length then @tokens[@pos + 1] else null

  advance: ->
    token = @current()
    @pos++
    token

  error: (message, code = 'PARSE_ERROR') ->
    @errors.push new CompileError message, 'parser', code, @current()?.location

  expect: (type) ->
    token = @current()
    if not token or token.type isnt type
      @error "Expected #{type} but got #{token?.type ? 'EOF'}", 'UNEXPECTED_TOKEN'
      @recover()
      return null
    @advance()

  recover: ->
    while @current()
      t = @current().type
      if t in [TokenType.TAG, TokenType.CLASS, TokenType.ID, TokenType.OUTPUT,
               TokenType.OUTPUT_UNESC, TokenType.CONTROL, TokenType.FILTER,
               TokenType.COMMENT, TokenType.HTML_COMMENT, TokenType.DOCTYPE,
               TokenType.INDENT, TokenType.DEDENT]
        return
      @advance()

  skip: (type) ->
    if @current()?.type is type
      @advance()
      return true
    false

  isAt: (type) -> @current()?.type is type

# ─── Public API ────────────────────────────────────────────

export parse = (tokens, filename = null) ->
  state = new ParserState tokens, filename

  prologue = []
  while state.current()?.type is TokenType.PROLOGUE
    prologue.push state.advance().value

  children = parseBlock state
  document: new Document children, prologue
  errors: state.errors

# ─── Block Parsing ─────────────────────────────────────────

parseBlock = (state) ->
  nodes = []
  while state.current() and state.current().type isnt TokenType.DEDENT
    node = parseNode state
    nodes.push node if node
  nodes

# ─── Node Dispatcher ───────────────────────────────────────

parseNode = (state) ->
  token = state.current()
  return null unless token

  switch token.type
    when TokenType.TAG          then parseElement state
    when TokenType.CLASS        then parseImplicitDiv state
    when TokenType.ID           then parseImplicitDiv state
    when TokenType.OUTPUT       then parseOutput state
    when TokenType.OUTPUT_UNESC then parseOutput state
    when TokenType.CONTROL      then parseControlFlow state
    when TokenType.COMMENT      then parseComment state
    when TokenType.HTML_COMMENT then parseHtmlComment state
    when TokenType.FILTER       then parseFilter state
    when TokenType.DOCTYPE      then parseDoctype state
    when TokenType.TEXT         then parseText state
    when TokenType.INDENT
      state.advance()
      null
    when TokenType.DEDENT
      null
    when TokenType.NEWLINE
      state.advance()
      null
    else
      state.advance()
      null

# ─── Element ───────────────────────────────────────────────

parseElement = (state) ->
  tagToken = state.expect TokenType.TAG
  unless tagToken
    return new Element 'div', location: state.current()?.location

  tag = tagToken.value
  isComponent = /^[A-Z]/.test tag

  classes = []
  id = null
  attributes = []
  isSelfClosing = false
  attrStyle = null

  while state.current() and (
    state.current().type in [
      TokenType.CLASS, TokenType.ID,
      TokenType.ATTRS_BRACE, TokenType.ATTRS_PAREN, TokenType.SELF_CLOSE
    ])

    tok = state.current()

    switch tok.type
      when TokenType.CLASS
        state.advance()
        classes.push tok.value
      when TokenType.ID
        state.advance()
        id = tok.value
      when TokenType.ATTRS_BRACE
        state.advance()
        attributes.push parseAttributeBlock(tok.value, '{}', tagToken.location)...
        attrStyle = 'braces'
      when TokenType.ATTRS_PAREN
        state.advance()
        attributes.push parseAttributeBlock(tok.value, '()', tagToken.location)...
        attrStyle = 'parens'
      when TokenType.SELF_CLOSE
        state.advance()
        isSelfClosing = true

  # Parse inline text or output
  children = []
  if state.current() and not isSelfClosing
    switch state.current().type
      when TokenType.OUTPUT
        tok = state.advance()
        children.push new Output(new Expression(tok.value), 'escaped', tok.location)
      when TokenType.OUTPUT_UNESC
        tok = state.advance()
        children.push new Output(new Expression(tok.value), 'unescaped', tok.location)
      when TokenType.TEXT
        textToken = state.advance()
        children.push new Text(textToken.value, textToken.location)

  # Parse child block if INDENT follows
  if state.current()?.type is TokenType.INDENT and not isSelfClosing
    state.advance()
    children = children.concat parseBlock state
    state.expect TokenType.DEDENT

  new Element tag, { classes, id, attributes, children, isComponent, isSelfClosing, attrStyle, location: tagToken.location }

# ─── ImplicitDiv ───────────────────────────────────────────

parseImplicitDiv = (state) ->
  classes = []
  id = null
  attributes = []
  attrStyle = null

  firstToken = state.current()

  while state.current() and (
    state.current().type in [TokenType.CLASS, TokenType.ID, TokenType.ATTRS_BRACE, TokenType.ATTRS_PAREN])

    tok = state.current()

    switch tok.type
      when TokenType.CLASS
        state.advance()
        classes.push tok.value
      when TokenType.ID
        state.advance()
        id = tok.value
      when TokenType.ATTRS_BRACE
        state.advance()
        attributes.push parseAttributeBlock(tok.value, '{}', firstToken.location)...
        attrStyle = 'braces'
      when TokenType.ATTRS_PAREN
        state.advance()
        attributes.push parseAttributeBlock(tok.value, '()', firstToken.location)...
        attrStyle = 'parens'

  # Parse inline text
  children = []
  if state.current()?.type is TokenType.TEXT
    textToken = state.advance()
    children.push new Text(textToken.value, textToken.location)

  # Parse child block
  if state.current()?.type is TokenType.INDENT
    state.advance()
    children = children.concat parseBlock state
    state.expect TokenType.DEDENT

  new ImplicitDiv { classes, id, attributes, children, attrStyle, location: firstToken.location }

# ─── Output ────────────────────────────────────────────────

parseOutput = (state) ->
  token = state.current()
  outputKind = if token.type is TokenType.OUTPUT then 'escaped' else 'unescaped'
  state.advance()
  expr = new Expression token.value

  children = []
  if state.current()?.type is TokenType.INDENT
    state.advance()
    children = parseBlock state
    state.expect TokenType.DEDENT

  new Output expr, outputKind, token.location, children

# ─── Control Flow ──────────────────────────────────────────

parseControlFlow = (state) ->
  token = state.expect TokenType.CONTROL
  unless token
    return new ControlFlow 'statement', new Expression(''), [], null, state.current()?.location

  source = token.value

  # Normalize "else if" → "if"
  if /^\s*else\s+if\b/.test source
    source = source.replace /^\s*else\s+/, ''

  controlKind = parseControlKind source
  exprSource = stripControlKeyword source, controlKind
  expr = new Expression exprSource

  children = []
  if state.current()?.type is TokenType.INDENT
    state.advance()
    children = parseBlock state
    state.expect TokenType.DEDENT

  # Check for chained else / else if
  next = null
  if state.current()?.type is TokenType.CONTROL
    nextSource = state.current().value.trimStart()
    if isElse nextSource
      next = parseControlFlow state

  new ControlFlow controlKind, expr, children, next, token.location

parseControlKind = (source) ->
  keyword = source.trimStart().split(/\s+/)[0]
  switch keyword
    when 'if'     then 'if'
    when 'unless' then 'unless'
    when 'for'    then 'for'
    when 'while'  then 'while'
    when 'else'   then 'else'
    else 'statement'

stripControlKeyword = (source, kind) ->
  trimmed = source.trimStart()
  return trimmed if kind is 'statement'
  keyword = if kind is 'else' then 'else' else kind
  re = new RegExp "^\\s*#{keyword}\\b\\s*"
  trimmed.replace re, ''

isElse = (source) -> /^\s*else\b/.test source

# ─── Comments ──────────────────────────────────────────────

parseComment = (state) ->
  token = state.expect TokenType.COMMENT
  return new Comment 'haml', '' unless token
  new Comment 'haml', token.value, token.location

parseHtmlComment = (state) ->
  token = state.expect TokenType.HTML_COMMENT
  return new Comment 'html', '' unless token
  new Comment 'html', token.value, token.location

# ─── Filter ────────────────────────────────────────────────

parseFilter = (state) ->
  token = state.expect TokenType.FILTER
  return new Filter '', '' unless token
  parts = token.value.split '\n'
  filterName = parts[0]
  content = parts.slice(1).join '\n'

  # Consume indented body
  if state.isAt TokenType.INDENT
    state.advance()
    lines = []
    while state.current() and not state.isAt TokenType.DEDENT
      tok = state.current()
      if tok.type is TokenType.TEXT
        lines.push tok.value
        state.advance()
      else if tok.type is TokenType.NEWLINE
        state.advance()
      else
        break
    state.advance() if state.isAt TokenType.DEDENT
    if lines.length > 0
      content = if content then content + '\n' + lines.join('\n') else lines.join '\n'

  new Filter filterName, content, token.location

# ─── Doctype ───────────────────────────────────────────────

parseDoctype = (state) ->
  token = state.expect TokenType.DOCTYPE
  return new Doctype 'html' unless token
  new Doctype(token.value or 'html', token.location)

# ─── Text ──────────────────────────────────────────────────

parseText = (state) ->
  token = state.expect TokenType.TEXT
  return new Text '' unless token
  new Text token.value, token.location

# ─── Attribute Block Parser ────────────────────────────────

parseAttributeBlock = (source, _style, _location = null) ->
  attrs = []
  return attrs unless source.trim()

  pairs = splitAttributePairs source

  for pair in pairs
    trimmed = pair.trim()
    continue unless trimmed

    # Spread: props... or ...props
    if trimmed.endsWith '...'
      expr = trimmed.slice(0, -3).trim()
      if expr
        attrs.push new SpreadAttribute new Expression expr
      continue

    if trimmed.startsWith '...'
      expr = trimmed.slice(3).trim()
      if expr
        attrs.push new SpreadAttribute new Expression expr
      continue

    colonIdx = findColon trimmed
    if colonIdx is -1
      # Shorthand: {foo} → foo={foo}
      attrs.push new Attribute trimmed, new Expression(trimmed), true
    else
      name = trimmed.slice(0, colonIdx).trim()
      value = trimmed.slice(colonIdx + 1).trim()
      cleanName = name.replace /^['"]|['"]$/g, ''
      attrs.push new Attribute cleanName, new Expression(value), false

  attrs

splitAttributePairs = (source) ->
  result = []
  depth = 0
  start = 0

  i = 0
  while i < source.length
    ch = source[i]

    if ch in ['{', '[', '('] then depth++
    else if ch in ['}', ']', ')'] then depth--
    else if ch in ['"', "'"] and depth is 0
      q = ch
      i++
      while i < source.length and source[i] isnt q
        i++ if source[i] is '\\'
        i++
    else if ch is ',' and depth is 0
      result.push source.slice start, i
      start = i + 1
    i++

  result.push source.slice start
  result

findColon = (source) ->
  depth = 0
  i = 0
  while i < source.length
    ch = source[i]
    if ch in ['{', '[', '('] then depth++
    else if ch in ['}', ']', ')'] then depth--
    else if ch in ['"', "'"] and depth is 0
      q = ch
      i++
      while i < source.length and source[i] isnt q
        i++ if source[i] is '\\'
        i++
    else if ch is ':' and depth is 0
      return i
    i++
  -1

# ParseResult shape: { document: Document, errors: CompileError[] }