export { compile, compileFile, resolveCoffeeHamlFile, COFFEEHAML_EXTENSIONS } from './compiler.js';
export { isCoffeeScriptAvailable } from './expressions.js';
export { CompileError, CompileWarning } from './types.js';
export type { CompilerOptions, CompileResult, FilterHandler } from './types.js';

// Prettier plugin (imported programmatically, or auto-discovered by Prettier)
export { default as prettierPlugin } from './prettier/index.js';
export type { CoffeeHamlFormatOptions } from './prettier/printer.js';