/**
 * CoffeeBlock Tests — fenced CoffeeScript areas (`--- ... ---`).
 * Run: node test/run-coffee-block-tests.mjs
 */
import { compile } from '../dist/compiler.js';
import { tokenize } from '../dist/lexer.js';

let passed = 0;
let failed = 0;

function ok(cond, label, detail) {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    console.log(`  \u2717 ${label}`);
    if (detail !== undefined) console.log(`      ${detail}`);
  }
}

// ─── Lexer: single token, dedented to column 0 ─────────────
{
  const toks = tokenize('---\n  a = 1\n  b = 2\n---\n%p hi');
  const blocks = toks.filter((t) => t.type === 'COFFEE_BLOCK');
  ok(blocks.length === 1, 'exactly one COFFEE_BLOCK token', JSON.stringify(toks.map((t) => t.type)));
  ok(blocks[0]?.value === 'a = 1\nb = 2', 'body dedented to column 0', JSON.stringify(blocks[0]?.value));
}

// ─── Top-level fence: imports + setup at module scope ─────
{
  const src = "---\nimport { blah } from 'ok'\nanswer = 42\n---\n%p= answer";
  const r = compile(src);
  ok(r.errors.length === 0, 'top-level fence compiles clean', JSON.stringify(r.errors));
  ok(/import\s*\{[\s\S]*?blah[\s\S]*?\}\s*from\s*'ok'/.test(r.code), 'import hoisted to module scope');
  ok(/const answer = 42/.test(r.code), 'assignment compiled to const');
  ok(r.code.indexOf('const answer') < r.code.indexOf('jsx('), 'block emitted before JSX render');
}

// ─── Nested fence: hoisted, no null placeholder ───────────
{
  const src = '%div\n  ---\n  helper = (x) -> x * 2\n  ---\n  %p= helper 21';
  const r = compile(src, { wrap: 'component' });
  ok(r.errors.length === 0, 'nested fence compiles clean', JSON.stringify(r.errors));
  ok(/const helper = /.test(r.code), 'helper hoisted to module scope');
  ok(!/children:\s*\[null/.test(r.code), 'no null placeholder for hoisted block', r.code);
}

// ─── Multiple fences + dedent normalization ───────────────
{
  const src = '---\nx = 1\ny = 2\n---\n%p= x + y\n---\nz = 3\n---\n%span= z';
  const r = compile(src);
  ok(r.errors.length === 0, 'multiple fences compile clean', JSON.stringify(r.errors));
  ok(/const x = 1; const y = 2/.test(r.code), 'first block compiled', r.code);
  ok(/const z = 3/.test(r.code), 'second block compiled', r.code);
}

// ─── `===` Yield: single COFFEE_YIELD token, dedented ─────
{
  const toks = tokenize('===\n  a = 1\n  a + 1\n===\n%p hi');
  const yields = toks.filter((t) => t.type === 'COFFEE_YIELD');
  ok(yields.length === 1, 'exactly one COFFEE_YIELD token', JSON.stringify(toks.map((t) => t.type)));
  ok(yields[0]?.value === 'a = 1\na + 1', 'yield body dedented to column 0', JSON.stringify(yields[0]?.value));
}

// ─── `===` single expression yields directly ─────────────
{
  const src = '%p\n  ===\n  user.name\n  ===';
  const r = compile(src);
  ok(r.errors.length === 0, 'single-expression yield compiles clean', JSON.stringify(r.errors));
  ok(/children:\s*user\.name/.test(r.code), 'yielded expression placed as children', r.code);
}

// ─── `===` multi-statement wraps in IIFE, returns last ────
{
  const src = '%p\n  ===\n  x = 1\n  y = x + 1\n  y\n  ===';
  const r = compile(src);
  ok(r.errors.length === 0, 'multi-statement yield compiles clean', JSON.stringify(r.errors));
  ok(/return\s*y/.test(r.code), 'IIFE returns last expression', r.code);
}

// ─── Fences do not cross: --- vs === ──────────────────────
{
  const toks = tokenize('===\na === b\n---\nx = 2\n===\n%p hi');
  const yields = toks.filter((t) => t.type === 'COFFEE_YIELD');
  ok(yields.length === 1, '=== block does not close on ---', JSON.stringify(toks.map((t) => t.type)));
  ok(yields[0]?.value.includes('---'), '--- line preserved inside === body', JSON.stringify(yields[0]?.value));
}

console.log(`\n${'\u2501'.repeat(40)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'\u2501'.repeat(40)}`);

if (failed > 0) process.exit(1);