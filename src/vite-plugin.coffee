# vite-plugin.coffee — Vite plugin for CoffeeHaml

import { compile } from './compiler.js'
import { basename } from 'path'

COFFEEHAML_RE = /\.(coffeehaml|cohaml|chaml)$/

componentNameFromPath = (filepath) ->
  stem = basename(filepath).split('.').shift() or 'Component'
  stem.charAt(0).toUpperCase() + stem.slice 1

export default coffeehaml = (options = {}) ->
  compilerOpts = Object.assign(
    { sourceMap: true, wrap: 'component' },
    options.compilerOptions ? {}
  )

  name: 'coffeehaml'

  transform: (code, id) ->
    return unless COFFEEHAML_RE.test id

    result = compile code,
      compilerOpts...
      filename: id
      componentName: compilerOpts.componentName or componentNameFromPath id

    preamble = ''
    postamble = ''
    if compilerOpts.wrap and compilerOpts.wrap isnt 'none' and not Array.isArray(compilerOpts.wrap)
      preamble = '// @refresh reset\n'
      name = compilerOpts.componentName or componentNameFromPath id
      postamble = """
        \nif (import.meta.hot) {
          import.meta.hot.accept((mod) => {
            if (mod?.#{name}) import.meta.hot?.data?.refresh?.();
          });
        }\n
      """

    finalCode = preamble + result.code + postamble

    if result.errors.length > 0
      err = result.errors[0]
      @error
        message: err.message
        id
        loc: if err.location
          line: err.location.start.line + 1
          column: err.location.start.column + 1
        else undefined
      return null

    code: finalCode
    map: if result.sourceMap then { mappings: result.sourceMap } else null

  handleHotUpdate: ({file, server}) ->
    if COFFEEHAML_RE.test file
      server.ws.send type: 'full-reload'
      return []