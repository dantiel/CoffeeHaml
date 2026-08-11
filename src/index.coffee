# index.coffee — public API

export { compile, compileFile, resolveCoffeeHamlFile, COFFEEHAML_EXTENSIONS } from './compiler.js'
export { isCoffeeScriptAvailable } from './expressions.js'
export { CompileError, CompileWarning } from './types.js'

# Prettier plugin
export { default as prettierPlugin } from './prettier/index.js'
