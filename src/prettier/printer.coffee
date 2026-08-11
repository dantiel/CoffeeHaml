# printer.coffee — AST → Prettier Doc IR
# Core formatting engine for CoffeeHaml Prettier plugin

import {
  Document, Element, ImplicitDiv, Text, Output, ControlFlow,
  Comment, Filter, Doctype, Node, Expression, Attribute, SpreadAttribute
} from '../ast.js'
import { formatCoffeeScript, formatCoffeeScriptBlock } from './coffeescript-formatter.js'
import { createRequire } from 'module'

_require = createRequire import.meta.url
_prettier = _require 'prettier'
{ group, indent, hardline, join } = _prettier.doc.builders

# ─── Format Options ────────────────────────────────────────
# CoffeeHamlFormatOptions shape (runtime):
#   tagCase, implicitDivExpansion, maxChainLength, inlineThreshold
#   voidElementStyle, attributeStyle, attributeMultilineThreshold
#   attributeSort, quoteStyle, coffeeScriptFormat, methodChainAlign
#   blankLineHandling, trailingWhitespace, continuationStyle
#   controlFlowInline, statementMerging, commentFormat
#   tabWidth, useTabs, printWidth, originalText?

defaultOpts =
  tagCase: 'preserve'
  implicitDivExpansion: false
  maxChainLength: 4
  inlineThreshold: -1
  voidElementStyle: 'self-closing'
  attributeStyle: 'preserve'
  attributeMultilineThreshold: 1
  attributeSort: 'none'
  quoteStyle: 'preserve'
  coffeeScriptFormat: true
  methodChainAlign: true
  blankLineHandling: 'preserve'
  trailingWhitespace: 'remove'
  continuationStyle: 'indent'
  controlFlowInline: false
  statementMerging: 'preserve'
  commentFormat: false
  tabWidth: 2
  useTabs: false
  printWidth: 80
  originalText: undefined

opts = (p) -> p.__opts or defaultOpts

# ─── MergedStatements wrapper ──────────────────────────────

class MergedStatements
  kind: 'MergedStatements'
  statements: []
  constructor: (@statements) ->

# ─── Constants ─────────────────────────────────────────────

VOID_ELEMENTS = new Set [
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]

isVoidElement = (tag) -> VOID_ELEMENTS.has tag.toLowerCase()

isSingleInlineChild = (children) ->
  children.length is 1 and (children[0] instanceof Text or children[0] instanceof Output)

# ─── Blank-line-aware join ─────────────────────────────────

joinChildrenWithBlanks = (nodes, docs, o) ->
  return '' if docs.length is 0
  return docs[0] if docs.length is 1
  result = []
  for i in [0...docs.length]
    if i > 0
      hasBlank = nodes[i]?._blankBefore or false
      result.push if hasBlank then [hardline, hardline] else hardline
    result.push docs[i]
  result

analyzeBlankLines = (children, originalText, locations) ->
  return unless originalText and children.length > 1
  for i in [0...children.length]
    node = children[i]
    continue unless node?.location
    prev = children[i - 1]
    continue unless prev?.location
    # Check for blank line in source between prev end and this node start
    prevEndOffset = prev.location.offset + prev.location.length
    currStartOffset = node.location.offset
    between = originalText.slice prevEndOffset, currStartOffset
    if /\n\s*\n/.test between
      node._blankBefore = true

# ─── Merge consecutive statements ──────────────────────────

mergeAllStatements = (children) ->
  return children unless children?.length > 1
  result = []
  i = 0
  while i < children.length
    child = children[i]
    if child instanceof ControlFlow and child.controlKind is 'statement' and child.children.length is 0
      group = [child]
      j = i + 1
      while j < children.length
        next = children[j]
        if next instanceof ControlFlow and next.controlKind is 'statement' and next.children.length is 0
          group.push next
          j++
        else
          break
      if group.length > 1
        result.push new MergedStatements group
        i = j
        continue
    result.push child
    i++
  result

# ─── Main entry ────────────────────────────────────────────

export print = (path, o, printFn) ->
  node = path.node
  return '' unless node

  # Hang options on path for nested lookups
  path.__opts = o

  printNode path, o, printFn

printNode = (path, o, printFn) ->
  node = path.node
  return '' unless node

  if node instanceof Document
    return printDoc path, o, printFn
  if node instanceof Element
    return printElement path, o, printFn
  if node instanceof ImplicitDiv
    return printImplicitDiv path, o, printFn
  if node instanceof Text
    return node.value
  if node instanceof Output
    return printOutput path, o, printFn
  if node instanceof ControlFlow
    return printControlFlow path, o, printFn
  if node instanceof MergedStatements
    return printMergedFlow path, o, printFn
  if node instanceof Comment
    return printComment path, o, printFn
  if node instanceof Filter
    return printFilter path, o, printFn
  if node instanceof Doctype
    return printDoctype path, o
  ''

# ─── Document ──────────────────────────────────────────────

printDoc = (path, o, printFn) ->
  node = path.node

  # Pre-pass: merge statements if enabled
  if o.statementMerging is 'merge'
    node.children = mergeAllStatements node.children

  # Pre-pass: analyze blank lines
  if o.blankLineHandling is 'preserve' and o.originalText
    for n in node.children
      next = node.children[node.children.indexOf(n) + 1]
      analyzeBlankLines [n, next], o.originalText if next

  # Print children
  childDocs = path.map(printFn, 'children') ? []
  join hardline, childDocs

# ─── Element ───────────────────────────────────────────────

printElement = (path, o, printFn) ->
  node = path.node
  tag = formatTag node.tag, o

  # Classes and ID
  classes = node.classes.map((c) -> ".#{c}").join ''
  id = if node.id then "##{node.id}" else ''

  # Attributes
  attrStyle = detectStyle node, o
  attrs = formatAttributes node, attrStyle, o

  # Self-close marker
  isVoid = typeof node.tag is 'string' and isVoidElement node.tag
  selfClose = ''
  if isVoid
    if o.voidElementStyle is 'self-closing'
      selfClose = '/'
    else if node.isSelfClosing
      selfClose = '/'
  else if node.isSelfClosing
    selfClose = '/'

  header = "%#{tag}#{classes}#{id}#{attrs}#{selfClose}"

  # Children
  children = node.children ? []
  if children.length is 0
    return header

  # Inline child
  if isSingleInlineChild(children) and o.controlFlowInline isnt false
    childDoc = path.map(printFn, 'children')?[0] ? ''
    return "#{header} #{childDoc}"

  childDocs = path.map(printFn, 'children') ? []
  joined = joinChildrenWithBlanks children, childDocs, o
  join hardline, [header, indent(joined)]

# ─── ImplicitDiv ───────────────────────────────────────────

printImplicitDiv = (path, o, printFn) ->
  node = path.node
  classes = node.classes.map((c) -> ".#{c}").join ''
  id = if node.id then "##{node.id}" else ''

  attrStyle = detectStyle node, o
  attrs = formatAttributes node, attrStyle, o

  header = "#{classes}#{id}#{attrs}"

  children = node.children ? []
  if children.length is 0
    return header

  if isSingleInlineChild(children)
    childDoc = path.map(printFn, 'children')?[0] ? ''
    return "#{header} #{childDoc}"

  childDocs = path.map(printFn, 'children') ? []
  joined = joinChildrenWithBlanks children, childDocs, o
  join hardline, [header, indent(joined)]

# ─── Output ────────────────────────────────────────────────

printOutput = (path, o, printFn) ->
  node = path.node
  marker = if node.outputKind is 'unescaped' then '!=' else '='

  expr = node.expression.source ? ''
  if o.coffeeScriptFormat
    expr = formatCoffeeScript expr, o

  children = node.children ? []
  if children.length is 0
    return "#{marker} #{expr}"

  childDocs = path.map(printFn, 'children') ? []
  joined = joinChildrenWithBlanks children, childDocs, o
  join hardline, ["#{marker} #{expr}", indent(joined)]

# ─── Control Flow ──────────────────────────────────────────

printControlFlow = (path, o, printFn) ->
  printFlow path, o, printFn

printFlow = (path, o, printFn) ->
  node = path.node
  kind = node.controlKind

  # Format expression
  expr = node.expression.source ? ''
  if o.coffeeScriptFormat and kind isnt 'statement'
    expr = formatCoffeeScript expr, o

  # Build header
  header = switch kind
    when 'statement' then '-'
    when 'else'      then '- else'
    when 'else if'   then "- else if #{expr}"
    else "- #{kind} #{expr}"

  children = node.children ? []

  # Inline expansion (controlFlowInline)
  if o.controlFlowInline and children.length > 0 and kind in ['if', 'unless', 'for', 'while']
    if children.length is 1 and (children[0] instanceof Element or children[0] instanceof ImplicitDiv)
      sep = if kind in ['if', 'unless'] then ' then ' else ' '
      return "#{header}#{sep}#{printNode(path.map(printFn, 'children.0'), o, printFn)}"

  if children.length is 0
    return header

  join hardline, [header, indent(join(hardline, path.map(printFn, 'children') ? []))]

printMergedFlow = (path, o, printFn) ->
  node = path.node
  lines = node.statements.map (stmt) ->
    expr = stmt.expression.source ? ''
    if o.coffeeScriptFormat
      expr = formatCoffeeScript expr, o
    '  ' + expr
  join hardline, ['-', lines.join('\n')]

# ─── Comment ───────────────────────────────────────────────

printComment = (path, o, _printFn) ->
  node = path.node
  if node.commentKind is 'html'
    return "/ #{node.text}"
  text = node.text or ''
  if o.commentFormat and text.length > o.printWidth * 0.7
    text = reflowCommentText text, o.printWidth
  "-# #{text}"

reflowCommentText = (text, width) ->
  words = text.split /\s+/
  lines = []
  current = ''
  for word in words
    if current.length + word.length + 1 > width - 3  # 3 = "-# "
      lines.push current.trim() if current
      current = word
    else
      current += if current then ' ' + word else word
  lines.push current.trim() if current
  lines.join '\n-# '

# ─── Filter ────────────────────────────────────────────────

printFilter = (path, o, _printFn) ->
  node = path.node
  header = ":#{node.filterName}"
  if node.content
    indented = node.content.split('\n').map((l) -> '  ' + l).join '\n'
    "#{header}\n#{indented}"
  else
    header

# ─── Doctype ───────────────────────────────────────────────

printDoctype = (path, o) ->
  node = path.node
  "!!! #{node.value or 'html'}"

# ─── Tag formatting ────────────────────────────────────────

formatTag = (tag, o) ->
  return tag.source if tag instanceof Expression
  if o.tagCase is 'lowercase' and /^[a-z]/.test tag
    return tag.toLowerCase()
  tag

# ─── Attribute style detection ─────────────────────────────

detectStyle = (node, o) ->
  if o.attributeStyle isnt 'preserve'
    return o.attributeStyle
  node.attrStyle ? 'bare'

formatAttributes = (node, style, o) ->
  attrs = node.attributes ? []
  return '' unless attrs.length > 0

  parts = []
  for attr in attrs
    if attr.spread
      expr = attr.expression.source ? ''
      if o.coffeeScriptFormat then expr = formatCoffeeScript expr, o
      parts.push if style is 'parens' then "...#{expr}" else "{#{expr}...}"
      continue

    name = attr.name
    val = attr.value.source ? ''
    if o.coffeeScriptFormat then val = formatCoffeeScript val, o

    if attr.shorthand
      parts.push name
    else
      parts.push "#{name}: #{val}"

  switch style
    when 'braces'
      "{ #{parts.join ', '} }"
    when 'parens'
      "( #{parts.join ', '} )"
    else
      parts.join ', '

# ─── CoffeeScript Embed (for Prettier embed) ───────────────

export embedCoffeeScript = (path, _print) ->
  node = path.node
  return null unless node

  if node instanceof Output or node instanceof ControlFlow
    expr = node.expression?.source
    return null unless expr and /[\u0000-\u00ff]/.test expr
    null

  null

export { MergedStatements, mergeAllStatements }