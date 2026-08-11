# compiler.coffee — compile pipeline orchestration

import { tokenize } from './lexer.js'
import { parse } from './parser.js'
import { emit } from './emitter.js'
import { CompileError } from './types.js'
import { isCoffeeScriptAvailable, getCoffeeScriptUnavailableReason } from './expressions.js'
import { readFileSync, existsSync } from 'fs'

# Supported extensions
export COFFEEHAML_EXTENSIONS = ['.coffeehaml', '.cohaml', '.chaml']

# Resolve a CoffeeHaml file path
export resolveCoffeeHamlFile = (filepath) ->
  return filepath if existsSync filepath
  for ext in COFFEEHAML_EXTENSIONS
    withExt = filepath + ext
    return withExt if existsSync withExt
  null

# Compile CoffeeHaml source to JavaScript
export compile = (source, options = {}) ->
  errors = []
  warnings = []

  # Warn if CoffeeScript unavailable
  unless isCoffeeScriptAvailable()
    warnings.push
      message: "CoffeeScript expression compiler unavailable: #{getCoffeeScriptUnavailableReason()}. CoffeeScript expressions will passthrough raw and may produce invalid JavaScript. Install coffeescript as a peer dependency."
      phase: 'compiler'

  # Phase 1: Lex
  try
    tokens = tokenize source, options.filename
  catch e
    return {
      code: ''
      errors: [wrapError e, 'lexer']
      warnings: []
    }

  # Phase 2: Parse
  parsed = parse tokens, options.filename
  ast = parsed.document

  if parsed.errors.length > 0
    errors.push parsed.errors...
    if ast.children.length is 0
      return { code: '', errors, warnings }

  # Phase 3: Emit
  try
    result = emit ast,
      sourceMap: options.sourceMap
      filename: options.filename
      jsxRuntime: options.jsxRuntime
      filters: options.filters
      wrap: options.wrap
      componentName: options.componentName
  catch e
    return {
      code: ''
      errors: [wrapError e, 'emitter']
      warnings
    }

  if result.warnings
    warnings.push result.warnings...

  {
    code: result.code
    sourceMap: result.sourceMap
    errors
    warnings
  }

# Compile from disk
export compileFile = (filepath, options = {}) ->
  source = readFileSync filepath, 'utf-8'
  compile source, {options..., filename: filepath}

# ─── Helpers ───────────────────────────────────────────────

wrapError = (e, phase) ->
  if e instanceof CompileError
    e.phase = phase
    return e
  new CompileError(
    if e instanceof Error then e.message else String e
    phase
    'INTERNAL_ERROR'
  )