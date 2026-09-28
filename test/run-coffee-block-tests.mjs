/**
 * CoffeeBlock Tests — fenced CoffeeScript areas.
 *   --- ... ---  render-time statements (multiline `-`)
 *   === ... ===  yield final value as content (multiline `=`)
 *   ~~~ ... ~~~  module-scope statements (runs once at import)
 * Run: node test/run-coffee-block-tests.mjs
 */
import { compile } from '../dist/compiler.js';
import { tokenize } from '../dist/lexer.js';
import { parse } from '../dist/parser.js';

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

// ─── Lexer: ~~~ preamble token ─────────────────────────────
{
  const toks = tokenize('~~~\n  a = 1\n  b = 2\n~~~\n%p hi');
  const preambles = toks.filter((t) => t.type === 'COFFEE_PREAMBLE');
  ok(preambles.length === 1, 'exactly one COFFEE_PREAMBLE token', JSON.stringify(toks.map((t) => t.type)));
  ok(preambles[0]?.value === 'a = 1\nb = 2', 'preamble body dedented to column 0', JSON.stringify(preambles[0]?.value));
}

// ─── Lexer: === yield token ────────────────────────────────
{
  const toks = tokenize('===\n  a = 1\n  a + 1\n===\n%p hi');
  const yields = toks.filter((t) => t.type === 'COFFEE_YIELD');
  ok(yields.length === 1, 'exactly one COFFEE_YIELD token', JSON.stringify(toks.map((t) => t.type)));
  ok(yields[0]?.value === 'a = 1\na + 1', 'yield body dedented to column 0', JSON.stringify(yields[0]?.value));
}

// ─── --- renders at render-time (unwrapped) ────────────────
{
  const src = '---\nx = 1\ny = x + 1\n---\n%p= y';
  const r = compile(src);
  ok(r.errors.length === 0, '--- block compiles clean', JSON.stringify(r.errors));
  ok(/const x = 1; const y = x \+ 1/.test(r.code), 'statements compiled to const', r.code);
  ok(r.code.indexOf('const x') < r.code.indexOf('jsx('), 'statements emitted before render', r.code);
}

// ─── --- renders at render-time (wrapped) ──────────────────
{
  const src = '---\nx = 1\ny = x + 1\n---\n%p= y';
  const r = compile(src, { wrap: 'component', componentName: 'Demo' });
  ok(r.errors.length === 0, 'wrapped --- block compiles clean', JSON.stringify(r.errors));
  ok(/function Demo\(props\)/.test(r.code), 'component wrapper emitted', r.code);
  ok(/const x = 1; const y = x \+ 1/.test(r.code), 'statements inside render-time IIFE', r.code);
  ok(/return jsx\("p", \{ children: y \}\)/.test(r.code), 'JSX returned after statements', r.code);
  ok(r.code.indexOf('const x') < r.code.indexOf('return jsx'), 'statements precede return', r.code);
}

// ─── --- behaves exactly like - ────────────────────────────
{
  const viaDash = compile('- x = 1\n- y = x + 1\n%p= y', { wrap: 'component', componentName: 'Demo' }).code;
  const viaBlock = compile('---\nx = 1\ny = x + 1\n---\n%p= y', { wrap: 'component', componentName: 'Demo' }).code;
  ok(viaDash === viaBlock, '--- block ≡ - statements (identical output)', `dash: ${viaDash}\nblock: ${viaBlock}`);
}

// ─── Nested --- becomes a placeholder (like nested -) ──────
{
  const src = '%div\n  ---\n  x = 1\n  ---\n  %p hi';
  const r = compile(src, { wrap: 'component', componentName: 'Demo' });
  ok(r.errors.length === 0, 'nested --- block compiles clean', JSON.stringify(r.errors));
  ok(/\/\* - const x = 1 \*\/ null/.test(r.code), 'nested block degrades to comment placeholder', r.code);
}

// ─── ~~~ hoists to module scope (unwrapped) ────────────────
{
  const src = "~~~\nimport { blah } from 'ok'\nanswer = 42\n~~~\n%p= answer";
  const r = compile(src);
  ok(r.errors.length === 0, '~~~ preamble compiles clean', JSON.stringify(r.errors));
  ok(/import\s*\{[\s\S]*?blah[\s\S]*?\}\s*from\s*'ok'/.test(r.code), 'import hoisted to module scope');
  ok(/const answer = 42/.test(r.code), 'assignment compiled to const');
  ok(r.code.indexOf('const answer') < r.code.indexOf('jsx('), 'preamble emitted before render', r.code);
}

// ─── ~~~ hoists to module scope (wrapped) ──────────────────
{
  const src = '%div\n  ~~~\n  helper = (x) -> x * 2\n  ~~~\n  %p= helper 21';
  const r = compile(src, { wrap: 'component', componentName: 'Demo' });
  ok(r.errors.length === 0, 'nested ~~~ preamble compiles clean', JSON.stringify(r.errors));
  ok(/const helper = /.test(r.code), 'helper hoisted to module scope', r.code);
  ok(r.code.indexOf('const helper') < r.code.indexOf('function Demo'), 'module-scope preamble precedes component', r.code);
  ok(!/children:\s*\[null/.test(r.code), 'no null placeholder for hoisted preamble', r.code);
}

// ─── === single expression yields directly ─────────────────
{
  const src = '%p\n  ===\n  user.name\n  ===';
  const r = compile(src);
  ok(r.errors.length === 0, 'single-expression yield compiles clean', JSON.stringify(r.errors));
  ok(/children:\s*user\.name/.test(r.code), 'yielded expression placed as children', r.code);
}

// ─── === multi-statement wraps in IIFE, returns last ───────
{
  const src = '%p\n  ===\n  x = 1\n  y = x + 1\n  y\n  ===';
  const r = compile(src);
  ok(r.errors.length === 0, 'multi-statement yield compiles clean', JSON.stringify(r.errors));
  ok(/return\s*y/.test(r.code), 'IIFE returns last expression', r.code);
}

// ─── Fences do not cross: --- vs === ───────────────────────
{
  const toks = tokenize('===\na === b\n---\nx = 2\n===\n%p hi');
  const yields = toks.filter((t) => t.type === 'COFFEE_YIELD');
  ok(yields.length === 1, '=== block does not close on ---', JSON.stringify(toks.map((t) => t.type)));
  ok(yields[0]?.value.includes('---'), '--- line preserved inside === body', JSON.stringify(yields[0]?.value));
}

// ─── No cross-call accumulator leakage (EmitState fix) ─────
{
  const a = compile('- x = 1\n- y = x + 1\n%p= y', { wrap: 'component', componentName: 'Demo' }).code;
  const b = compile('%div\n  ~~~\n  helper = (x) -> x * 2\n  ~~~\n  %p= helper 21', { wrap: 'component', componentName: 'Demo' }).code;
  ok(!b.includes('y = x + 1') && !b.includes('const x = 1'), 'no hoisted/warnings leakage across compile calls', b);
  ok(a.includes('const x = 1'), 'first compile still self-consistent', a);
}

// ─── Sibling output is not swallowed by an empty element ───
{
  // Empty element on its own line, output directive on the next line
  const doc = parse(tokenize('%span\n= do coffeeStuff')).document;
  ok(
    doc.children.length === 2 && doc.children[0].children.length === 0,
    'empty %span does not swallow next-line = output',
    JSON.stringify(doc.children),
  );

  // Element with inline text, output directive on the next line
  const doc2 = parse(tokenize('%span not empty\n= do coffeeStuff')).document;
  ok(
    doc2.children.length === 2 && doc2.children[0].children.length === 1,
    'inline text stays, next-line = output stays a sibling',
    JSON.stringify(doc2.children),
  );

  // Inline output on the same line is still swallowed correctly
  const doc3 = parse(tokenize('%span= do coffeeStuff')).document;
  ok(
    doc3.children.length === 1 && doc3.children[0].children.length === 1,
    'same-line inline = output still a child',
    JSON.stringify(doc3.children),
  );
}

console.log(`\n${'\u2501'.repeat(40)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'\u2501'.repeat(40)}`);

if (failed > 0) process.exit(1);