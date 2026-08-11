/**
 * Statement Merging Tests
 * Run: node test/prettier/run-statement-merge-tests.mjs
 */
import * as prettierModule from 'prettier';
import plugin from '../../dist/prettier/index.js';

const prettier = prettierModule.default || prettierModule;

let passed = 0;
let failed = 0;

async function fmt(source, opts = {}) {
  return prettier.format(source, {
    parser: 'coffeehaml',
    plugins: [plugin],
    ...opts,
  });
}

const indent = '  ';

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (e) {
    failed++;
    console.log(`  \u2717 ${name}`);
    console.log(`${indent}${e.message.replace(/\n/g, '\n' + indent)}`);
  }
}

function eq(actual, expected, msg = '') {
  const a = typeof actual === 'string' ? actual.trim() : actual;
  const e = typeof expected === 'string' ? expected.trim() : expected;
  if (a !== e) {
    throw new Error(`${msg ? msg + ': ' : ''}expected:\n${indent}${e.replace(/\n/g, '\n'+indent)}\n  got:\n${indent}${a.replace(/\n/g, '\n'+indent)}`);
  }
}

function contains(text, substring) {
  if (!text.includes(substring)) {
    throw new Error(`expected to contain "${substring}"`);
  }
}

// ═══════════════════════════════════════════════════════════

console.log('\n── Statement Merging — Basic ──');

await test('two statements merge', async () => {
  eq(await fmt('- x = 1\n- y = 2', { statementMerging: 'merge' }),
     '-\n  x = 1\n  y = 2');
});

await test('three statements merge', async () => {
  eq(await fmt('- x = 1\n- y = 2\n- z = 3', { statementMerging: 'merge' }),
     '-\n  x = 1\n  y = 2\n  z = 3');
});

await test('single statement stays single', async () => {
  eq(await fmt('- x = 1', { statementMerging: 'merge' }),
     '- x = 1');
});

console.log('\n── Statement Merging — Idempotency ──');

await test('two-statement merge idempotent', async () => {
  const src = '- x = 1\n- y = 2';
  const pass1 = await fmt(src, { statementMerging: 'merge' });
  const pass2 = await fmt(pass1, { statementMerging: 'merge' });
  eq(pass2, pass1);
});

await test('merged output preserved on re-format', async () => {
  // When we format merged output again, it should stay merged
  const merged = '-\n  x = 1\n  y = 2';
  const pass2 = await fmt(merged, { statementMerging: 'merge' });
  eq(pass2, merged);
});

console.log('\n── Statement Merging — Non-merge Cases ──');

await test('statements with children not merged', async () => {
  const src = '- x = 1\n-\n  helper()\n  work()\n- y = 2';
  const r = await fmt(src, { statementMerging: 'merge' });
  // The middle statement has children, so no merging occurs
  contains(r, '- x = 1');
  contains(r, 'helper()');
  contains(r, '- y = 2');
});

await test('control flow breaks adjacency', async () => {
  const src = '- x = 1\n- if cond\n  %span hi\n- y = 2';
  const r = await fmt(src, { statementMerging: 'merge' });
  contains(r, '- x = 1');
  contains(r, '- if cond');
  contains(r, '- y = 2');
});

await test('element between breaks adjacency', async () => {
  const src = '- x = 1\n%hr/\n- y = 2';
  const r = await fmt(src, { statementMerging: 'merge' });
  contains(r, '- x = 1');
  contains(r, '%hr/');
  contains(r, '- y = 2');
});

console.log('\n── Statement Merging — preserve mode ──');

await test('preserve keeps separate', async () => {
  const src = '- x = 1\n- y = 2\n- z = 3';
  const r = await fmt(src, { statementMerging: 'preserve' });
  contains(r, '- x = 1');
  contains(r, '- y = 2');
  contains(r, '- z = 3');
});

await test('default is preserve', async () => {
  const src = '- x = 1\n- y = 2';
  const r = await fmt(src);
  contains(r, '- x = 1');
  contains(r, '- y = 2');
});

// ═══════════════════════════════════════════════════════════

console.log(`\n${'═'.repeat(40)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'═'.repeat(40)}`);

if (failed > 0) process.exit(1);
