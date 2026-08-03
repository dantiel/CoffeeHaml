import { createRequire } from 'module';
import { Expression } from './ast.js';

// ESM-safe CoffeeScript loader — uses createRequire for projects with "type": "module"
const _require = createRequire(import.meta.url);

function loadCoffeeScript(): any {
  try {
    return _require('coffeescript');
  } catch {
    return null;
  }
}

/** Track CoffeeScript availability and warnings. */
let _coffeeScriptAvailable: boolean | null = null;
let _coffeeScriptUnavailableReason: string = '';

function checkCoffeeScript(): boolean {
  if (_coffeeScriptAvailable !== null) return _coffeeScriptAvailable;
  try {
    const cs = loadCoffeeScript();
    if (cs && typeof cs.compile === 'function') {
      _coffeeScriptAvailable = true;
      return true;
    }
    _coffeeScriptAvailable = false;
    _coffeeScriptUnavailableReason = 'CoffeeScript module loaded but has no compile() function';
    return false;
  } catch (e) {
    _coffeeScriptAvailable = false;
    _coffeeScriptUnavailableReason = `CoffeeScript unavailable: ${e instanceof Error ? e.message : String(e)}`;
    return false;
  }
}

/** Returns true if CoffeeScript is available for expression compilation. */
export function isCoffeeScriptAvailable(): boolean {
  return checkCoffeeScript();
}

/** Get a human-readable reason if CoffeeScript is not available. */
export function getCoffeeScriptUnavailableReason(): string {
  checkCoffeeScript(); // ensure initialized
  return _coffeeScriptUnavailableReason;
}

/** Parse a CoffeeScript expression string into its AST representation.
 *  Uses the host's CoffeeScript installation. Returns null gracefully
 *  if CoffeeScript is unavailable or parsing fails. */
export function parseExpression(source: string): Expression {
  const expr = new Expression(source);

  try {
    const CoffeeScript = loadCoffeeScript();
    if (CoffeeScript && typeof CoffeeScript.parse === 'function') {
      expr.parsed = CoffeeScript.parse(source, { bare: true });
    }
  } catch {
    // Parse error — store raw source, let emitter handle it
  }

  return expr;
}

/** Compile a CoffeeScript expression to JavaScript.
 *  If no parsed AST, compiles from source directly.
 *  Returns the source as-is if compilation fails. */
export function compileExpression(expr: Expression): string {
  if (expr.source.trim() === '') return '';

  try {
    const CoffeeScript = loadCoffeeScript();
    if (CoffeeScript && typeof CoffeeScript.compile === 'function') {
      const js = CoffeeScript.compile(expr.source, {
        bare: true,
        inlineMap: false,
      });
      // CoffeeScript.compile wraps result in an IIFE or adds var — strip to get expression
      return stripCoffeeWrapper(js, expr.source);
    }
  } catch {
    // Fall through
  }

  return expr.source;
}

/** Strip CoffeeScript's wrapper to get a clean expression.
 *  CoffeeScript.compile('x + 1', {bare: true}) → "var x;\n\nx + 1;\n"
 *  We want just "x + 1" */
function stripCoffeeWrapper(js: string, _original: string): string {
  let result = js.trim();

  // Remove trailing semicolon and whitespace
  result = result.replace(/;\s*$/, '');

  // If result is multiline, take the last significant line
  const lines = result.split('\n').filter(l => l.trim() !== '');
  if (lines.length > 0) {
    // Remove 'var' declarations from the expression
    const meaningful = lines.filter(l => !/^\s*var\b/.test(l));
    if (meaningful.length > 0) {
      return meaningful.join('\n');
    }
    return lines[lines.length - 1];
  }

  return result;
}