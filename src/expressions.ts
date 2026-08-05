import { createRequire } from 'module';
import { Expression } from './ast.js';
import { SourceLocation, CompileError } from './types.js';

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
 *  Returns the source as-is if compilation fails.
 *  @param location Source location for error context. */
export function compileExpression(expr: Expression, location?: SourceLocation): string {
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (location) {
      throw new CompileError(
        `CoffeeScript expression error: ${msg}`,
        'emitter',
        'EXPRESSION_ERROR',
        location,
        `Check expression: ${expr.source.slice(0, 80)}`
      );
    }
    // Without location, return raw source with warning
  }

  return expr.source;
}

/** Strip CoffeeScript's wrapper to get a clean expression.
 *  CoffeeScript.compile('x + 1', {bare: true}) → "var x;\n\nx + 1;\n"
 *  We want just "x + 1".
 *
 *  When CoffeeScript generates var declarations (e.g. for ?. operator:
 *  "var ref;\n(ref = a) != null ? ref.b : void 0"), stripping them leaves
 *  undeclared refs. We wrap in an IIFE to scope the vars locally. */
function stripCoffeeWrapper(js: string, _original: string): string {
  let result = js.trim();

  // Remove trailing semicolon and whitespace
  result = result.replace(/;\s*$/, '');

  // If result is multiline, take the last significant line
  const lines = result.split('\n').filter(l => l.trim() !== '');
  if (lines.length > 0) {
    const varLines = lines.filter(l => /^\s*var\b/.test(l));
    const meaningful = lines.filter(l => !/^\s*var\b/.test(l));

    if (meaningful.length > 0) {
      if (varLines.length > 0) {
        // Var declarations stripped — wrap in IIFE to keep refs scoped
        const body = meaningful.join(' ');
        return `(() => { ${varLines.join(' ')} return ${body}; })()`;
      }
      return meaningful.join('\n');
    }
    return lines[lines.length - 1];
  }

  return result;
}

/** Compile a CoffeeScript statement, preserving variable declarations.
 *  CoffeeScript.compile('sim = useSimulation()', {bare: true}) → "var sim;\n\nsim = useSimulation();\n"
 *  We want: "const sim = useSimulation();"
 *  Multi-var: "var a, b; a = 1; b = 2;" → "let a = 1; let b = 2;"
 *  @param location Source location for error context. */
export function compileStatement(source: string, location?: SourceLocation): string {
  try {
    const CoffeeScript = loadCoffeeScript();
    if (CoffeeScript && typeof CoffeeScript.compile === 'function') {
      const js = CoffeeScript.compile(source, {
        bare: true,
        inlineMap: false,
      });
      return stripToConst(js.trim());
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (location) {
      throw new CompileError(
        `CoffeeScript compilation error: ${msg}`,
        'emitter',
        'COMPILE_ERROR',
        location,
        `Check statement: ${source.slice(0, 80)}`
      );
    }
    // Without location, fall through to raw passthrough
  }
  return source;
}

/** Convert CoffeeScript var declarations to const/let statements. */
function stripToConst(js: string): string {
  const lines = js.split('\n').filter(l => l.trim() !== '');

  // Pattern: "var x, y;" followed by assignment lines
  const varLine = lines.find(l => /^\s*var\b/.test(l));
  if (!varLine) return js.replace(/;\s*$/, '');

  // Extract var names
  const varNames = varLine.replace(/^\s*var\s+/, '').replace(/;\s*$/, '').split(',').map(s => s.trim()).filter(Boolean);

  // Find assignment lines
  const assignments: string[] = [];
  for (const name of varNames) {
    const assignLine = lines.find(l => {
      const trimmed = l.trim();
      return trimmed.startsWith(`${name} =`) || trimmed.startsWith(`${name}=`);
    });
    if (assignLine) {
      assignments.push('const ' + assignLine.trim().replace(/;\s*$/, ''));
    }
  }

  if (assignments.length > 0) return assignments.join('; ');
  // Fallback: keep var line, drop empty lines
  return lines.filter(l => !/^\s*$/.test(l)).join(' ').replace(/;\s*$/, '');
}