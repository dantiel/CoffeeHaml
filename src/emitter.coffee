# emitter.coffee — AST → JSX/JS code generation

import {
  Document, Element, ImplicitDiv, Text, Output, ControlFlow,
  Comment, Filter, Doctype, Node, Expression
} from './ast.js'
import { compileExpression, compileStatement } from './expressions.js'
import { CompileWarning } from './types.js'
import { SourceMapGenerator } from 'source-map'

VOID_ELEMENTS = new Set [
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]

# ─── Emit State ────────────────────────────────────────────

class EmitState
  indent: 0
  output: ''
  needsFragment: false
  needsImport: false
  options: null
  sourceMapGenerator: null
  outputLine: 0
  warnings: []
  hoisted: []
  directEmit: false

  constructor: (@options = {}) ->
    if @options.sourceMap and @options.filename
      @sourceMapGenerator = new SourceMapGenerator file: @options.filename

  emit: (s) ->
    if s
      @output += ' '.repeat(@indent * 2) + s

  emitLine: (s = '') ->
    if s
      @output += ' '.repeat(@indent * 2) + s
    @output += '\n'
    @outputLine++

  mapSource: (loc) ->
    return unless @sourceMapGenerator and loc
    outputCol = @indent * 2
    @sourceMapGenerator.addMapping
      generated: line: @outputLine + 1, column: outputCol
      original: line: loc.line + 1, column: loc.column
      source: @options.filename or 'source.coffeehaml'

  indentBlock: (fn) ->
    @indent++
    fn()
    @indent--

# ─── Public API ────────────────────────────────────────────

export emit = (ast, options = {}) ->
  state = new EmitState options

  state.emitLine "import { jsx, jsxs, Fragment } from \"#{options.jsxRuntime or 'react/jsx-runtime'}\";"

  # Emit prologue lines
  if ast.prologue and ast.prologue.length > 0
    for line in ast.prologue
      state.emitLine line
  state.emitLine()

  wrap = options.wrap
  if wrap and wrap isnt 'none'
    name = options.componentName or 'Component'
    hocs = switch wrap
      when 'component' then []
      when 'observer'   then ['observer']
      else wrap
    bodyExpr = compileComponentBody ast, state
    inner = "function #{name}(props) { return #{bodyExpr}; }"
    wrapped = hocs.reduceRight ((acc, hoc) -> "#{hoc}(#{acc})"), inner
    state.emitLine "export default #{wrapped}"
  else
    state.directEmit = true
    emitNodes ast.children, state, true

  result = code: state.output, warnings: state.warnings
  result.sourceMap = state.sourceMapGenerator.toString() if state.sourceMapGenerator
  result

# ─── Component Body Compilation ─────────────────────────────

compileComponentBody = (ast, state) ->
  tmpState = new EmitState state.options
  tmpState.indent = state.indent

  emitNodes ast.children, tmpState, true

  state.warnings.push tmpState.warnings...

  body = tmpState.output.trim()
  hoistedJs = if tmpState.hoisted.length > 0
    tmpState.hoisted.join('; ') + '; '
  else
    ''

  unless body
    return "(()-> { #{hoistedJs}return null; })()" if hoistedJs
    return 'null'

  stmts = splitJsStatements body

  jsx = if stmts.length is 0
    'null'
  else if stmts.length is 1
    stmts[0]
  else
    "jsxs(Fragment, { children: [#{stmts.join ', '}] })"

  if hoistedJs
    return "(()-> { #{hoistedJs}return #{jsx}; })()"

  jsx

splitJsStatements = (body) ->
  stmts = []
  depth = 0
  inString = null
  start = 0

  i = 0
  while i < body.length
    ch = body[i]

    if inString
      if ch is '\\'
        i++
        continue
      if ch is inString
        inString = null
      i++
      continue

    if ch in ["'", '"', '`']
      inString = ch
      i++
      continue
    if ch in ['{', '[', '(']
      depth++
      i++
      continue
    if ch in ['}', ']', ')']
      depth--
      i++
      continue

    if ch is ';' and depth is 0 and body[i + 1] is '\n'
      stmt = body.slice(start, i).trim()
      stmts.push stmt if stmt
      start = i + 2
      i++

    i++

  last = body.slice(start).trim()
  if last
    stmts.push if last.endsWith(';') then last.slice(0, -1).trim() else last

  stmts

# ─── Node Emitters ─────────────────────────────────────────

emitNodes = (nodes, state, isRoot = false) ->
  i = 0
  while i < nodes.length
    node = nodes[i]

    if node instanceof ControlFlow
      remaining = nodes.slice i + 1
      emitControlFlow node, remaining, state, isRoot
      return
    else
      emitNode node, state, isRoot
    i++

emitNode = (node, state, isRoot) ->
  if node instanceof Element      then emitElement node, state
  else if node instanceof ImplicitDiv then emitImplicitDiv node, state
  else if node instanceof Text        then emitText node, state
  else if node instanceof Output      then emitOutput node, state
  else if node instanceof ControlFlow then emitControlFlow node, [], state, isRoot
  else if node instanceof Comment     then emitComment node, state
  else if node instanceof Filter      then emitFilter node, state
  else if node instanceof Doctype     then emitDoctype node, state

# ─── Element ───────────────────────────────────────────────

emitElement = (el, state) ->
  mapSourceLocation el.location, state
  isVoid = typeof el.tag is 'string' and VOID_ELEMENTS.has el.tag
  hasChildren = not isVoid and el.children.length > 0

  tagJs = tagToJs el
  attrResult = buildAttributes el
  attrs = attrResult.parts
  keyArg = if attrResult.keyExpr then ", #{attrResult.keyExpr}" else ''

  if hasChildren
    if el.children.length is 1
      childJs = emitChildToJs el.children[0], state
      childrenAttr = "children: #{childJs}"
      allAttrs = if attrs.length > 0 then "{ #{attrs.join ', '}, #{childrenAttr} }" else "{ #{childrenAttr} }"
      state.emitLine "jsx(#{tagJs}, #{allAttrs}#{keyArg});"
    else
      childParts = el.children.map (c) -> emitChildToJs c, state
      childrenAttr = "children: [#{childParts.join ', '}]"
      allAttrs = if attrs.length > 0 then "{ #{attrs.join ', '}, #{childrenAttr} }" else "{ #{childrenAttr} }"
      state.emitLine "jsxs(#{tagJs}, #{allAttrs}#{keyArg});"
  else
    attrsJs = if attrs.length > 0 then "{ #{attrs.join ', '} }" else 'null'
    state.emitLine "jsx(#{tagJs}, #{attrsJs}#{keyArg});"

tagToJs = (el) ->
  if el.tag instanceof Expression
    return compileExpression el.tag, el.location
  if el.isComponent
    return el.tag
  "\"#{el.tag}\""

buildAttributes = (el) ->
  parts = []

  if el.id
    parts.push "id: \"#{el.id}\""

  classNames = el.classes.slice()

  for attr in el.attributes
    if attr.spread
      valJs = compileExpression attr.expression
      parts.push "...#{valJs}"
      continue

    valJs = compileExpression attr.value
    name = attrNameToJs attr.name

    if name in ['className', 'class']
      if attr.shorthand
        classNames.push "$\{#{valJs}}"
      else
        classNames.push valJs.replace /^['"]|['"]$/g, ''
    else
      parts.push "#{name}: #{valJs}"

  if classNames.length > 0
    unique = [...new Set classNames]
    if unique.length is 1 and not unique[0].includes('${')
      parts.push "className: \"#{unique[0]}\""
    else
      joined = unique.map((c) -> if c.includes('${') then c else "\"#{c}\"").join ' + " " + '
      parts.push "className: #{joined}"

  # Extract key
  keyExpr = null
  filteredParts = []
  for p in parts
    if p.startsWith 'key: '
      keyExpr = p.slice(5).trim()
    else
      filteredParts.push p

  parts: filteredParts
  keyExpr: keyExpr

attrNameToJs = (name) ->
  return 'className' if name is 'class'
  return 'htmlFor'  if name is 'for'
  return "\"#{name}\"" if name.includes '-'
  name

emitImplicitDiv = (div, state) ->
  mapSourceLocation div.location, state
  el = new Element 'div',
    classes: div.classes
    id: div.id
    attributes: div.attributes
    children: div.children
    isComponent: false
    isSelfClosing: false
    location: div.location
  emitElement el, state

# ─── Child Emission ────────────────────────────────────────

emitChildToJs = (node, state) ->
  if node instanceof Text
    return escapeString node.value
  if node instanceof Output
    # Arrow continuation
    if node.children.length > 0 and /->\s*$/.test node.expression.source.trim()
      return emitArrowOutputToJs node.expression.source, node.children, state
    textContinuations = (c.value for c in node.children when c instanceof Text)
    exprSource = if textContinuations.length > 0
      [node.expression.source, textContinuations...].join ' '
    else
      node.expression.source
    return compileExpression new Expression(exprSource), node.location
  if node instanceof Element
    hasChildren = node.children.length > 0
    tagJs = tagToJs node
    attrResult = buildAttributes node
    attrs = attrResult.parts
    keyArg = if attrResult.keyExpr then ", #{attrResult.keyExpr}" else ''

    if hasChildren
      childParts = node.children.map (c) -> emitChildToJs c, state
      childrenAttr = if childParts.length is 1 then "children: #{childParts[0]}" else "children: [#{childParts.join ', '}]"
      fn = if childParts.length is 1 then 'jsx' else 'jsxs'
      allAttrs = if attrs.length > 0 then "{ #{attrs.join ', '}, #{childrenAttr} }" else "{ #{childrenAttr} }"
      return "#{fn}(#{tagJs}, #{allAttrs}#{keyArg})"
    attrsJs = if attrs.length > 0 then "{ #{attrs.join ', '} }" else 'null'
    return "jsx(#{tagJs}, #{attrsJs}#{keyArg})"
  if node instanceof ImplicitDiv
    el = new Element 'div',
      classes: node.classes
      id: node.id
      attributes: node.attributes
      children: node.children
      isComponent: false
      isSelfClosing: false
      location: node.location
    return emitChildToJs el, state
  if node instanceof ControlFlow
    return emitControlFlowToJs node, state
  if node instanceof Filter
    return emitFilterToJs node, state
  'null'

# ─── Control Flow ──────────────────────────────────────────

emitControlFlow = (cf, remaining, state, _isRoot) ->
  if cf.controlKind is 'statement'
    emitStatement cf, remaining, state
  else if cf.isLoop()
    emitLoop cf, remaining, state
  else
    emitConditional cf, remaining, state

emitStatement = (cf, remaining, state) ->
  js = compileStatement cf.expression.source.trim(), cf.location

  stmts = [js]
  for child in cf.children
    if child instanceof Text
      stmts.push compileStatement child.value, child.location
    else
      emitNode child, state, false

  if state.directEmit
    state.emitLine(s + ';') for s in stmts
  else
    state.hoisted.push stmts...

  if remaining.length > 0
    emitNodes remaining, state

emitLoop = (cf, remaining, state) ->
  if cf.controlKind is 'for'
    expr = cf.expression.source.trim()
    forMatch = expr.match /^(.+?)\s+in\s+(.+)$/
    if forMatch
      vars = forMatch[1].trim()
      iterable = forMatch[2].trim()

      state.emit "(#{compileExpression new Expression(iterable), cf.location}).map((#{vars}) => "

      if cf.children.length is 0
        state.output += 'null'
      else if cf.children.length is 1
        state.output += emitChildToJs cf.children[0], state
      else
        state.output += "jsxs(Fragment, { children: [#{cf.children.map((c) -> emitChildToJs c, state).join ', '}] })"

      state.output += ')'

      if remaining.length > 0
        state.output += ',\n'
        emitNodes remaining, state
      else
        state.output += ';\n'
      return

  if cf.controlKind is 'while'
    cond = compileExpression cf.expression, cf.location
    state.emitLine '(() => {'
    state.indentBlock ->
      state.emitLine 'const __result = [];'
      state.emitLine "while (#{cond}) {"
      state.indentBlock ->
        if cf.children.length is 1 and cf.children[0] instanceof Element
          state.emit "__result.push(#{emitChildToJs cf.children[0], state});\n"
        else
          state.emit "__result.push(jsxs(Fragment, { children: [#{cf.children.map((c) -> emitChildToJs c, state).join ', '}] }));\n"
      state.emitLine '}'
      state.emitLine 'return __result;'
    state.emit '})()'
    if remaining.length > 0
      state.output += ',\n'
      emitNodes remaining, state
    else
      state.output += ';\n'
    return

  state.emitLine "/* TODO: emit loop #{cf.controlKind} */"

emitConditional = (cf, remaining, state) ->
  if cf.controlKind is 'else'
    emitElseBranch cf, state
    return

  condition = compileExpression cf.expression, cf.location

  if cf.controlKind is 'unless'
    state.emit "!(#{condition}) ? "
  else
    state.emit "#{condition} ? "

  # Then branch
  if cf.children.length is 0
    state.output += 'null'
  else if cf.children.length is 1
    state.output += emitChildToJs cf.children[0], state
  else
    state.output += "jsxs(Fragment, { children: [#{cf.children.map((c) -> emitChildToJs c, state).join ', '}] })"

  state.output += ' : '

  if cf.next
    emitConditional cf.next, [], state
  else if remaining.length > 0
    if remaining.length is 1
      state.output += emitChildToJs remaining[0], state
    else
      state.output += "jsxs(Fragment, { children: [#{remaining.map((c) -> emitChildToJs c, state).join ', '}] })"
  else
    state.output += 'null'

  state.output += ';\n'

emitElseBranch = (cf, state) ->
  if cf.children.length is 0
    state.output += 'null'
  else if cf.children.length is 1
    state.output += emitChildToJs cf.children[0], state
  else
    state.output += "jsxs(Fragment, {}, #{cf.children.map((c) -> emitChildToJs c, state).join ', '})"

emitControlFlowToJs = (cf, state) ->
  if cf.isLoop() and cf.controlKind is 'for'
    expr = cf.expression.source.trim()
    forMatch = expr.match /^(.+?)\s+in\s+(.+)$/
    if forMatch
      vars = forMatch[1].trim()
      iterable = forMatch[2].trim()
      compiledIterable = compileExpression new Expression(iterable), cf.location
      body = if cf.children.length is 1
        emitChildToJs cf.children[0], state
      else
        "jsxs(Fragment, { children: [#{cf.children.map((c) -> emitChildToJs c, state).join ', '}] })"
      return "(#{compiledIterable}).map((#{vars}) => #{body})"

  if cf.controlKind is 'else'
    return if cf.children.length is 1
      emitChildToJs cf.children[0], state
    else if cf.children.length > 0
      "jsxs(Fragment, {}, #{cf.children.map((c) -> emitChildToJs c, state).join ', '})"
    else
      'null'

  if cf.isConditional()
    condition = compileExpression cf.expression, cf.location
    condExpr = if cf.controlKind is 'unless' then "!(#{condition})" else condition
    consequent = if cf.children.length is 1
      emitChildToJs cf.children[0], state
    else if cf.children.length > 0
      "jsxs(Fragment, {}, #{cf.children.map((c) -> emitChildToJs c, state).join ', '})"
    else
      'null'
    alternate = if cf.next then emitControlFlowToJs cf.next, state else 'null'
    return "#{condExpr} ? #{consequent} : #{alternate}"

  if cf.controlKind is 'statement'
    js = compileExpression cf.expression, cf.location
    return "/* - #{js} */ null"

  'null'

# ─── Text / Output / Comment / Filter / Doctype ────────────

emitText = (text, state) ->
  state.emitLine "\"#{escapeString text.value}\";"

emitOutput = (out, state) ->
  textLines = []
  elementChildren = []

  for child in out.children
    if child instanceof Text
      textLines.push child.value
    else
      elementChildren.push child

  exprSource = out.expression.source
  if textLines.length > 0
    exprSource = [exprSource, textLines...].join ' '

  # Arrow continuation
  if elementChildren.length > 0 and /->\s*$/.test exprSource.trim()
    emitArrowOutput exprSource, elementChildren, out, state
    return

  js = compileExpression new Expression(exprSource), out.location
  result = if out.outputKind is 'escaped'
    "jsx(Fragment, { children: #{js} })"
  else
    "jsx(Fragment, {}, #{js})"

  emitNode child, state, false for child in elementChildren

  state.emitLine result + ';'

emitArrowOutput = (exprSource, elementChildren, out, state) ->
  stripped = exprSource.replace(/\s*->\s*$/, '').trim()
  arrowMatch = stripped.match /^(.+?)\s*\(([^)]*)\)\s*$/

  if arrowMatch
    callTarget = arrowMatch[1].trim()
    arrowArgs = arrowMatch[2].trim()
  else
    callTarget = stripped
    arrowArgs = ''

  compiledTarget = compileExpression new Expression(callTarget), out.location

  body = if elementChildren.length is 1
    emitChildToJs elementChildren[0], state
  else
    "jsxs(Fragment, { children: [#{elementChildren.map((c) -> emitChildToJs c, state).join ', '}] })"

  arrowFn = if arrowArgs then "(#{arrowArgs}) => #{body}" else "() => #{body}"
  result = if out.outputKind is 'escaped'
    "jsx(Fragment, { children: #{compiledTarget}(#{arrowFn}) })"
  else
    "jsx(Fragment, {}, #{compiledTarget}(#{arrowFn}))"

  state.emitLine result + ';'

emitArrowOutputToJs = (exprSource, elementChildren, state) ->
  stripped = exprSource.replace(/\s*->\s*$/, '').trim()
  arrowMatch = stripped.match /^(.+?)\s*\(([^)]*)\)\s*$/

  if arrowMatch
    callTarget = arrowMatch[1].trim()
    arrowArgs = arrowMatch[2].trim()
  else
    callTarget = stripped
    arrowArgs = ''

  compiledTarget = compileExpression new Expression(callTarget)

  body = if elementChildren.length is 1
    emitChildToJs elementChildren[0], state
  else
    "jsxs(Fragment, { children: [#{elementChildren.map((c) -> emitChildToJs c, state).join ', '}] })"

  arrowFn = if arrowArgs then "(#{arrowArgs}) => #{body}" else "() => #{body}"
  "#{compiledTarget}(#{arrowFn})"

emitComment = (comment, state) ->
  if comment.commentKind is 'html'
    state.emitLine "/* <!-- #{comment.text} --> */"

emitFilter = (filter, state) ->
  { filterName, content } = filter

  handler = state.options.filters?[filterName]
  if handler
    html = handler content, filterName
    state.emitLine "jsx(Fragment, { dangerouslySetInnerHTML: { __html: #{JSON.stringify html} } })"
    return

  switch filterName
    when 'css'
      state.warnings.push
        message: ':css filter emits raw CSS string — not usable as a <style> tag in React. Use a plugin handler to inject CSS properly.'
        location: filter.location
        phase: 'emitter'
      state.emitLine "\"#{escapeString content}\";"
    when 'javascript'
      state.warnings.push
        message: ':javascript filter emits raw JS at module level — an XSS risk with untrusted input. Ensure content is trusted.'
        location: filter.location
        phase: 'emitter'
      state.emitLine content
    when 'coffee'
      state.emitLine content
    else
      state.warnings.push
        message: ":#{filterName} filter used but no handler registered. Add one to compilerOptions.filters."
        location: filter.location
        phase: 'emitter'
      state.emitLine "\"#{escapeString content}\";"

emitFilterToJs = (filter, state) ->
  { filterName, content } = filter

  handler = state.options.filters?[filterName]
  if handler
    html = handler content, filterName
    return "jsx(Fragment, { dangerouslySetInnerHTML: { __html: #{JSON.stringify html} } })"

  escapeString content

emitDoctype = (doctype, state) ->
  state.emitLine "// DOCTYPE #{doctype.value or 'html'}"

# ─── Helpers ───────────────────────────────────────────────

escapeString = (s) -> JSON.stringify s

mapSourceLocation = (loc, state) ->
  if loc then state.mapSource loc.start