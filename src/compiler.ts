import { tokenize } from './lexer.js';
import { parse } from './parser.js';
import { emit } from './emitter.js';
import { CompilerOptions, CompileResult, CompileError, CompileWarning } from './types.js';
import { readFileSync, existsSync } from 'fs';

/** Supported CoffeeHaml file extensions (in order of preference). */
export const COFFEEHAML_EXTENSIONS = ['.coffeehaml', '.cohaml', '.chaml'];

/** Resolve a CoffeeHaml file path, trying each extension if none given. */
export function resolveCoffeeHamlFile(filepath: string): string | null {
  if (existsSync(filepath)) return filepath;
  for (const ext of COFFEEHAML_EXTENSIONS) {
    const withExt = filepath + ext;
    if (existsSync(withExt)) return withExt;
  }
  return null;
}

/** Compile CoffeeHaml source to JavaScript. */
export function compile(source: string, options: CompilerOptions = {}): CompileResult {
  const errors: CompileError[] = [];
  const warnings: CompileWarning[] = [];

  // Phase 1: Lex
  let tokens;
  try {
    tokens = tokenize(source, options.filename);
  } catch (e) {
    return {
      code: '',
      errors: [wrapError(e, 'lexer')],
      warnings: [],
    };
  }

  // Phase 2: Parse
  let ast;
  try {
    ast = parse(tokens, options.filename);
  } catch (e) {
    return {
      code: '',
      errors: [wrapError(e, 'parser')],
      warnings: [],
    };
  }

  // Phase 3: Emit
  let result;
  try {
    result = emit(ast, {
      sourceMap: options.sourceMap,
      filename: options.filename,
      jsxRuntime: options.jsxRuntime,
    });
  } catch (e) {
    return {
      code: '',
      errors: [wrapError(e, 'emitter')],
      warnings: [],
    };
  }

  return {
    code: result.code,
    sourceMap: result.sourceMap,
    errors,
    warnings,
  };
}

/** Compile a CoffeeHaml file from disk. */
export function compileFile(filepath: string, options: CompilerOptions = {}): CompileResult {
  const source = readFileSync(filepath, 'utf-8');
  return compile(source, { ...options, filename: filepath });
}

function wrapError(e: unknown, phase: string): CompileError {
  if (e instanceof CompileError) {
    e.phase = phase;
    return e;
  }
  return new CompileError(
    e instanceof Error ? e.message : String(e),
    phase,
    'INTERNAL_ERROR',
  );
}