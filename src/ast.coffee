# ast.coffee — CoffeeHaml AST node types
# Mirrors src/ast.ts with CoffeeScript idioms

import { SourceLocation } from './types.js'

# ─── Node Kinds ────────────────────────────────────────────

export NodeKind = [
  'Document'
  'Element'
  'ImplicitDiv'
  'Text'
  'Output'
  'ControlFlow'
  'Comment'
  'Filter'
  'Doctype'
]

export ControlFlowKind = ['if', 'unless', 'for', 'while', 'else', 'statement']
export CommentKind = ['haml', 'html']
export OutputKind = ['escaped', 'unescaped']

# ─── Base Node ─────────────────────────────────────────────

export class Node
  kind: null   # set by subclasses
  location: null

  constructor: (@location) ->

# ─── Expression ────────────────────────────────────────────

export class Expression
  source: ''
  parsed: null

  constructor: (@source, @parsed = null) ->

  toString: -> @source

# ─── Document ──────────────────────────────────────────────

export class Document extends Node
  kind: 'Document'
  prologue: []
  children: []

  constructor: (@children, @prologue = [], location = null) ->
    super location

# ─── Attribute types ───────────────────────────────────────

export class Attribute
  spread: undefined
  name: ''
  value: null    # Expression
  shorthand: false
  constructor: (@name, @value, @shorthand = false) ->

export class SpreadAttribute
  spread: true
  expression: null  # Expression
  constructor: (@expression) ->

export AnyAttribute = null  # Attribute | SpreadAttribute (union, runtime only)

# ─── Element ───────────────────────────────────────────────

export class Element extends Node
  kind: 'Element'
  tag: null               # string | Expression
  classes: []
  id: null
  attributes: []
  children: []
  isComponent: false
  isSelfClosing: false
  attrStyle: null         # 'braces' | 'parens' | 'bare' | null

  constructor: (tag, opts = {}) ->
    super opts.location
    @tag = tag
    @classes = opts.classes ? []
    @id = opts.id ? null
    @attributes = opts.attributes ? []
    @children = opts.children ? []
    @isComponent = opts.isComponent ? false
    @isSelfClosing = opts.isSelfClosing ? false
    @attrStyle = opts.attrStyle ? null

# ─── ImplicitDiv ───────────────────────────────────────────

export class ImplicitDiv extends Node
  kind: 'ImplicitDiv'
  classes: []
  id: null
  attributes: []
  children: []
  attrStyle: null

  constructor: (opts = {}) ->
    super opts.location
    @classes = opts.classes ? []
    @id = opts.id ? null
    @attributes = opts.attributes ? []
    @children = opts.children ? []
    @attrStyle = opts.attrStyle ? null

# ─── Text ──────────────────────────────────────────────────

export class Text extends Node
  kind: 'Text'
  value: ''

  constructor: (@value, location = null) ->
    super location

# ─── Output ────────────────────────────────────────────────

export class Output extends Node
  kind: 'Output'
  expression: null   # Expression
  outputKind: 'escaped'
  children: []

  constructor: (@expression, @outputKind, location = null, @children = []) ->
    super location

# ─── ControlFlow ───────────────────────────────────────────

export class ControlFlow extends Node
  kind: 'ControlFlow'
  controlKind: 'if'
  expression: null
  children: []
  next: null

  constructor: (@controlKind, @expression, @children = [], @next = null, location = null) ->
    super location

  isLoop: -> @controlKind in ['for', 'while']
  isConditional: -> @controlKind in ['if', 'unless']

  chainLength: ->
    count = 0
    n = this
    while n
      count++
      n = n.next
    count

# ─── Comment ───────────────────────────────────────────────

export class Comment extends Node
  kind: 'Comment'
  commentKind: 'haml'
  text: ''

  constructor: (@commentKind, @text, location = null) ->
    super location

# ─── Filter ────────────────────────────────────────────────

export class Filter extends Node
  kind: 'Filter'
  filterName: ''
  content: ''

  constructor: (@filterName, @content, location = null) ->
    super location

# ─── Doctype ───────────────────────────────────────────────

export class Doctype extends Node
  kind: 'Doctype'
  value: ''

  constructor: (@value, location = null) ->
    super location
