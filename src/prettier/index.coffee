# index.coffee — CoffeeHaml Prettier Plugin entry point

import { tokenize } from '../lexer.js'
import { parse } from '../parser.js'
import { print, embedCoffeeScript } from './printer.js'
import { options, defaultOptions } from './options.js'

# ─── Language ──────────────────────────────────────────────

coffeeHamlLanguage =
  name: 'CoffeeHaml'
  parsers: ['coffeehaml']
  extensions: ['.chaml', '.coffeehaml']
  vscodeLanguageIds: ['coffeehaml']

# ─── Parser ────────────────────────────────────────────────

coffeeHamlParser =
  parse: (text, _options) ->
    tokens = tokenize text
    result = parse tokens
    if result.errors.length > 0 and result.document.children.length is 0
      throw new Error(
        'CoffeeHaml parse errors:\n' +
        result.errors.map((e) -> "  #{e.message}").join '\n'
      )
    result.document

  astFormat: 'coffeehaml-ast'

  locStart: (node) -> node?.location?.offset ? 0
  locEnd: (node) ->
    return 0 unless node?.location
    node.location.offset + node.location.length
  hasPragma: (text) ->
    /\/\*\*\s*@format\s*\*\//.test(text) or /^\/\s*@format/.test text

# ─── Printer ───────────────────────────────────────────────

coffeeHamlPrinter =
  print: (path, options, printFn, _args) ->
    opts = options
    if options.originalText
      opts.originalText = options.originalText
    print path, opts, printFn

  embed: (path, _options) ->
    embedCoffeeScript(path, print) ? null

  insertPragma: (text) ->
    '/** @format */\n' + text

# ─── Export ────────────────────────────────────────────────

_parsers = {}
_parsers.coffeehaml = coffeeHamlParser
_printers = {}
_printers['coffeehaml-ast'] = coffeeHamlPrinter

plugin = {
  languages: [coffeeHamlLanguage]
  parsers: _parsers
  printers: _printers
  options
  defaultOptions
}

export default plugin
export { options, defaultOptions } from './options.js'
export { print } from './printer.js'