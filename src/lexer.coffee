# lexer.coffee — CoffeeHaml tokenizer
# Converts raw .chaml source into a token stream with INDENT/DEDENT

import { SourceLocation } from './types.js'

# ─── Token Types ───────────────────────────────────────────

export TokenType =
  TAG:          'TAG'
  CLASS:        'CLASS'
  ID:           'ID'
  ATTRS_PAREN:  'ATTRS_PAREN'
  ATTRS_BRACE:  'ATTRS_BRACE'
  ATTRS_BARE:   'ATTRS_BARE'
  OUTPUT:       'OUTPUT'
  OUTPUT_UNESC: 'OUTPUT_UNESC'
  CONTROL:      'CONTROL'
  COMMENT:      'COMMENT'
  HTML_COMMENT: 'HTML_COMMENT'
  FILTER:       'FILTER'
  DOCTYPE:      'DOCTYPE'
  TEXT:         'TEXT'
  PROLOGUE:     'PROLOGUE'
  INDENT:       'INDENT'
  DEDENT:       'DEDENT'
  NEWLINE:      'NEWLINE'
  SELF_CLOSE:   'SELF_CLOSE'

# ─── Token (plain object convention) ───────────────────────
# { type, value, location, indent? }

# ─── Main entry ────────────────────────────────────────────

# ─── Pre-processing: merge lines with unclosed attribute brackets ──
preMergeBracketLines = (lines) ->
  result = []
  i = 0
  while i < lines.length
    line = lines[i]
    rest = line.replace(/^\s+/, '')
    # Check if this is a HAML tag/implicit-div line with unclosed {
    if /^[%.#]/.test(rest) and rest.includes('{') and not rest.includes('}')
      merged = line
      i++
      while i < lines.length
        merged += '\n' + lines[i]
        i++
        break if lines[i - 1].includes('}')
      result.push merged
    else if /^[%.#]/.test(rest) and rest.includes('(') and not rest.includes(')')
      merged = line
      i++
      while i < lines.length
        merged += '\n' + lines[i]
        i++
        break if lines[i - 1].includes(')')
      result.push merged
    else
      result.push line
      i++
  result

export tokenize = (source, filename = null) ->
  tokens = []
  lines = preMergeBracketLines source.split '\n'
  indentStack = [0]
  offset = 0
  lineIndex = 0
  inPrologue = true

  for rawLine in lines
    line = rawLine.replace /\r$/, ''
    lineLength = rawLine.length + 1

    # Skip empty lines
    if line.trim() is ''
      offset += lineLength
      lineIndex++
      continue

    indent = countIndent line
    content = line.slice indent

    if content is ''
      offset += lineLength
      lineIndex++
      continue

    # Prologue detection: non-indented JS before first HAML construct
    if inPrologue and indent is 0 and not isHamlConstruct content
      tokens.push
        type: TokenType.PROLOGUE
        value: content
        location:
          start: line: lineIndex, column: indent
          end: line: lineIndex, column: indent + content.length
          offset: offset + indent
          length: lineLength - indent
          file: filename
      offset += lineLength
      lineIndex++
      continue
    inPrologue = false

    # Handle indentation changes
    currentIndent = indentStack[indentStack.length - 1]

    if indent > currentIndent
      indentStack.push indent
      tokens.push indentToken indent, offset, indent, filename, lineIndex
    else if indent < currentIndent
      while indentStack.length > 1 and indent < indentStack[indentStack.length - 1]
        indentStack.pop()
        tokens.push dedentToken offset, filename, lineIndex
      if indent isnt indentStack[indentStack.length - 1]
        indentStack.push indent
        tokens.push indentToken indent, offset, indent, filename, lineIndex

    # Parse line content
    lineStartOffset = offset + indent
    lineTokens = tokenizeLine content, lineStartOffset, lineLength - indent, filename, lineIndex
    tokens.push lineTokens...

    offset += lineLength
    lineIndex++

  # Emit remaining DEDENT tokens at EOF
  while indentStack.length > 1
    indentStack.pop()
    tokens.push dedentToken offset, filename, lineIndex

  tokens

# ─── Line Tokenization ─────────────────────────────────────

tokenizeLine = (content, lineStartOffset, _lineLength, filename = null, lineIndex = 0) ->
  tokens = []
  pos = 0

  loc = (start, end) ->
    {
      start: { line: lineIndex ? 0, column: lineStartOffset + start }
      end:   { line: lineIndex ? 0, column: lineStartOffset + end }
      offset: lineStartOffset + start
      length: end - start
      file: filename
    }

  firstChar = content[0]

  # %tag
  if firstChar is '%'
    end = 1
    while end < content.length and /[\w-]/.test content[end]
      end++
    tagName = content.slice 1, end
    tokens.push type: TokenType.TAG, value: tagName, location: loc 0, end
    pos = end

    # Self-closing /
    if content[pos] is '/'
      tokens.push type: TokenType.SELF_CLOSE, value: '/', location: loc pos, pos + 1
      pos++

    modResult = parseModifiersAndAttrs content, pos, lineStartOffset, filename, lineIndex
    tokens.push modResult.tokens...
    pos = modResult.pos

    # Self-closing / after attributes (must check BEFORE remaining text)
    if content[pos] is '/'
      tokens.push type: TokenType.SELF_CLOSE, value: '/', location: loc pos, pos + 1
      pos++

    remaining = content.slice(pos).trimStart()
    trimmedOffset = content.length - remaining.length
    if remaining
      if remaining.startsWith('= ') or remaining is '='
        tokens.push type: TokenType.OUTPUT, value: remaining.slice(1).trimStart(), location: loc trimmedOffset + 1, content.length
      else if remaining.startsWith '!= '
        tokens.push type: TokenType.OUTPUT_UNESC, value: remaining.slice(2).trimStart(), location: loc trimmedOffset + 2, content.length
      else if looksLikeBareAttributes remaining
        tokens.push type: TokenType.ATTRS_BARE, value: remaining, location: loc trimmedOffset, content.length
      else unless remaining.startsWith('{') or remaining.startsWith '('
        tokens.push type: TokenType.TEXT, value: remaining, location: loc trimmedOffset, content.length

    return tokens

  # .class / #id (implicit div) — only if followed by valid identifier
  if (firstChar in ['.', '#']) and /^[.#][\w-]/.test content
    modResult = parseModifiersAndAttrs content, 0, lineStartOffset, filename, lineIndex
    tokens.push modResult.tokens...
    pos = modResult.pos

    # Self-closing / after attributes (must check BEFORE remaining text)
    if content[pos] is '/'
      tokens.push type: TokenType.SELF_CLOSE, value: '/', location: loc pos, pos + 1
      pos++

    remaining = content.slice(pos).trimStart()
    trimmedOffset = content.length - remaining.length
    if remaining
      if remaining.startsWith('= ') or remaining is '='
        tokens.push type: TokenType.OUTPUT, value: remaining.slice(1).trimStart(), location: loc trimmedOffset + 1, content.length
      else if remaining.startsWith '!= '
        tokens.push type: TokenType.OUTPUT_UNESC, value: remaining.slice(2).trimStart(), location: loc trimmedOffset + 2, content.length
      else if looksLikeBareAttributes remaining
        tokens.push type: TokenType.ATTRS_BARE, value: remaining, location: loc trimmedOffset, content.length
      else unless remaining.startsWith('{') or remaining.startsWith '('
        tokens.push type: TokenType.TEXT, value: remaining, location: loc trimmedOffset, content.length

    return tokens

  # = expression
  if firstChar is '=' and content[1] isnt '='
    expr = content.slice(1).trimStart()
    return [{ type: TokenType.OUTPUT, value: expr, location: loc 1, content.length }]

  # != expression
  if firstChar is '!' and content[1] is '='
    expr = content.slice(2).trimStart()
    return [{ type: TokenType.OUTPUT_UNESC, value: expr, location: loc 2, content.length }]

  # - control / comment
  if firstChar is '-'
    if content[1] is '#'
      return [{ type: TokenType.COMMENT, value: content.slice(2).trimStart(), location: loc 2, content.length }]
    expr = content.slice(1).trimStart()
    return [{ type: TokenType.CONTROL, value: expr, location: loc 1, content.length }]

  # / HTML comment
  if firstChar is '/'
    return [{ type: TokenType.HTML_COMMENT, value: content.slice(1).trimStart(), location: loc 1, content.length }]

  # :filter
  if firstChar is ':'
    spaceIdx = content.search /\s/
    filterName = if spaceIdx is -1 then content.slice 1 else content.slice 1, spaceIdx
    filterContent = if spaceIdx is -1 then '' else content.slice spaceIdx + 1
    return [{ type: TokenType.FILTER, value: "#{filterName}\n#{filterContent}", location: loc 0, content.length }]

  # !!! doctype
  if content.startsWith '!!!'
    val = content.slice(3).trimStart()
    return [{ type: TokenType.DOCTYPE, value: val or 'html', location: loc 0, content.length }]

  # Plain text
  [{ type: TokenType.TEXT, value: content, location: loc 0, content.length }]

# ─── Modifiers and Attributes ──────────────────────────────

parseModifiersAndAttrs = (content, startPos, lineStartOffset, filename = null, lineIndex = 0) ->
  tokens = []
  pos = startPos

  loc = (start, end) ->
    {
      start: { line: lineIndex ? 0, column: lineStartOffset + start }
      end:   { line: lineIndex ? 0, column: lineStartOffset + end }
      offset: lineStartOffset + start
      length: end - start
      file: filename
    }

  while pos < content.length
    ch = content[pos]

    if ch in [' ', '\t']
      pos++
      continue

    # .class
    if ch is '.'
      end = pos + 1
      while end < content.length and /[\w-]/.test content[end]
        end++
      className = content.slice pos + 1, end
      tokens.push type: TokenType.CLASS, value: className, location: loc pos, end
      pos = end
      continue

    # #id
    if ch is '#'
      end = pos + 1
      while end < content.length and /[\w-]/.test content[end]
        end++
      idName = content.slice pos + 1, end
      tokens.push type: TokenType.ID, value: idName, location: loc pos, end
      pos = end
      continue

    # {attribute block}
    if ch is '{'
      block = extractBracketed content, pos, '{', '}'
      if block isnt null
        tokens.push type: TokenType.ATTRS_BRACE, value: block, location: loc pos, pos + block.length + 2
        pos += block.length + 2
      else
        tokens.push type: TokenType.ATTRS_BRACE, value: content.slice(pos + 1), location: loc pos, content.length
        pos = content.length
      continue

    # (attribute block)
    if ch is '('
      block = extractBracketed content, pos, '(', ')'
      if block isnt null
        tokens.push type: TokenType.ATTRS_PAREN, value: block, location: loc pos, pos + block.length + 2
        pos += block.length + 2
      else
        tokens.push type: TokenType.ATTRS_PAREN, value: content.slice(pos + 1), location: loc pos, content.length
        pos = content.length
      continue

    # Anything else → stop
    break

  { tokens, pos }

# ─── Helpers ───────────────────────────────────────────────

# Detects bare HTML-style attributes: key="val", key='val', key={expr}
looksLikeBareAttributes = (text) ->
  return false unless text and text.length > 0
  # Must contain at least one = sign
  return false unless text.includes '='
  # Split on whitespace, skip empty
  parts = text.match(/\S+/g) ? []
  return false if parts.length is 0
  # At least one part must look like key=value or be {expr}
  for part in parts
    return true if /^[\w-]+=/.test part       # key="val" or key='val' or key={expr}
    return true if /^[\w-]+\{/.test part      # key{...}  alternative
    return true if /^=\{/.test part           # ={expr}
  false

isHamlConstruct = (content) ->
  fc = content[0]
  fc in ['%', '.', '#', '=', '-', '/', ':'] or
    (fc is '!' and content[1] is '=') or
    content.startsWith '!!!'

countIndent = (line) ->
  count = 0
  for ch in line
    if ch is ' '
      count++
    else if ch is '\t'
      count += 2
    else
      break
  count

indentToken = (_indent, offset, level, filename = null, line = 0) ->
  type: TokenType.INDENT
  value: ''
  indent: level
  location: {
    start: { line: line ? 0, column: 0 }
    end: { line: line ? 0, column: 0 }
    offset
    length: 0
    file: filename
  }

dedentToken = (offset, filename = null, line = 0) ->
  type: TokenType.DEDENT
  value: ''
  indent: undefined
  location: {
    start: { line: line ? 0, column: 0 }
    end: { line: line ? 0, column: 0 }
    offset
    length: 0
    file: filename
  }

extractBracketed = (content, start, open, close) ->
  depth = 0
  pos = start
  while pos < content.length
    if content[pos] is open then depth++
    else if content[pos] is close
      depth--
      if depth is 0 then return content.slice start + 1, pos
    # Skip string literals
    if content[pos] in ['"', "'"]
      q = content[pos]
      pos++
      while pos < content.length and content[pos] isnt q
        pos++ if content[pos] is '\\'
        pos++
    pos++
  null