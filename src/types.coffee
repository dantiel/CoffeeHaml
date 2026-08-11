# types.coffee — shared types for CoffeeHaml compiler
# CoffeeScript version — interfaces become plain classes with JSDoc

# ─── Source Location ───────────────────────────────────────

export class SourcePosition
  line: 0       # 0-based
  column: 0     # 0-based
  constructor: (@line, @column) ->

export class SourceLocation
  start: null     # SourcePosition
  end: null       # SourcePosition
  offset: 0
  length: 0
  file: null
  constructor: ({@start, @end, @offset, @length, @file}) ->

# ─── Compile Error ─────────────────────────────────────────

export class CompileError extends Error
  location: null
  phase: ''
  hint: null
  code: ''

  constructor: (message, @phase, @code, @location = null, @hint = null) ->
    super message
    @name = 'CompileError'

# ─── Compile Warning ───────────────────────────────────────

export class CompileWarning
  message: ''
  location: null
  phase: ''
  constructor: (@message, @location = null, @phase = '') ->

# ─── Compiler Options ──────────────────────────────────────

export CompilerOptions = null  # plain object, documented below

# CompilerOptions shape:
#   filename?: string
#   sourceMap?: boolean
#   jsxRuntime?: string
#   jsxImportSource?: string
#   filters?: { [name: string]: (content: string, filterName: string) => string }
#   wrap?: 'none' | 'component' | 'observer' | string[]
#   componentName?: string

# ─── Compile Result ────────────────────────────────────────

export CompileResult = null  # { code, sourceMap?, errors: CompileError[], warnings: CompileWarning[] }

# ─── Emitter Options ───────────────────────────────────────

export EmitterOptions = null  # same shape as CompilerOptions without export-related fields

# ─── Emit Result ───────────────────────────────────────────

export EmitResult = null  # { code, sourceMap?, warnings: CompileWarning[] }

# ─── Filter Handler ────────────────────────────────────────

export FilterHandler = null  # (content: string, filterName: string) => string
