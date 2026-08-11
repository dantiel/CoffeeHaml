/**
 * CoffeeHaml Prettier — Integration Tests
 *
 * End-to-end tests: format + re-parse + format again (idempotency).
 * Node 14 compatible (no Vitest needed).
 */

import prettier from 'prettier';

// Resolve plugin from dist
import plugin from '../../dist/prettier/index.js';

let passed = 0;
let failed = 0;

async function test(name, source, coffeeHamlOpts = {}, expected) {
  try {
    const result = await prettier.format(source, {
      parser: 'coffeehaml',
      plugins: [plugin],
      ...coffeeHamlOpts,
    });
    const output = result.trim();
    if (expected !== undefined) {
      const exp = expected.trim();
      if (output !== exp) {
        console.log(`\n  FAIL: ${name}`);
        console.log(`    expected: ${JSON.stringify(exp)}`);
        console.log(`    got:      ${JSON.stringify(output)}`);
        failed++;
        return;
      }
    }
    // Idempotency check: format again, should not change
    const second = (await prettier.format(output, {
      parser: 'coffeehaml',
      plugins: [plugin],
      ...coffeeHamlOpts,
    })).trim();
    if (output !== second) {
      console.log(`\n  FAIL (idempotency): ${name}`);
      console.log(`    first:  ${JSON.stringify(output)}`);
      console.log(`    second: ${JSON.stringify(second)}`);
      failed++;
      return;
    }
    passed++;
  } catch (e) {
    console.log(`\n  ERROR: ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

async function run() {
  // ─── Elements ────────────────────────────────────────────
  await test('simple element', '%div hello');
  await test('element with class', '%div.klass hello');
  await test('element with id', '%div#myid hello');
  await test('element with class and id', '%div.klass#myid hello');
  await test('inline text', '%span inline text');
  await test('nested elements',
    '%div\n' +
    '  %span child');
  await test('deeply nested',
    '%div\n' +
    '  %ul\n' +
    '    %li item');

  // ─── Implicit Div ───────────────────────────────────────
  await test('implicit div with class', '.klass hello');
  await test('implicit div with id', '#myid hello');
  await test('implicit div with class and id', '.klass#myid hello');

  // ─── Output ─────────────────────────────────────────────
  await test('output preserved inline',
    '%p Hello, = @name!',
    {},
    '%p Hello, = @name!');
  await test('output multiline',
    '%div\n' +
    '  = @content');

  // ─── Control Flow ──────────────────────────────────────
  await test('if block',
    '- if @active\n' +
    '  %span Active');
  await test('if/else chain',
    '- if @a\n' +
    '  %span A\n' +
    '- else if @b\n' +
    '  %span B\n' +
    '- else\n' +
    '  %span C');
  await test('for loop',
    '- for item in @items\n' +
    '  %li= item');
  await test('preserve standalone statements',
    '- x = 1\n' +
    '- y = 2');

  // ─── Attributes ─────────────────────────────────────────
  await test('brace attributes',
    '%div{key: "value"} hello');
  await test('paren attributes',
    '%div(key="value") hello');
  await test('bare attributes',
    '%div key="value" hello');
  await test('multiline braces',
    '%div{\n' +
    '  key1: "val1",\n' +
    '  key2: "val2"\n' +
    '} content');
  await test('multiline parens',
    '%div(\n' +
    '  key1="val1",\n' +
    '  key2="val2"\n' +
    ') content');

  // ─── Comments ───────────────────────────────────────────
  await test('comment',
    '/# This is a comment\n' +
    '%div hello');
  await test('html comment',
    '/ This is HTML comment\n' +
    '%div hello');

  // ─── Filters ────────────────────────────────────────────
  await test('css filter',
    '%style\n' +
    '  :css\n' +
    '    .foo { color: red; }');
  await test('coffeescript filter',
    ':coffeescript\n' +
    '  x = 1\n' +
    '  y = 2');

  // ─── Doctype ────────────────────────────────────────────
  await test('doctype', '!!! 5\n%div hello');

  // ─── Prologue ───────────────────────────────────────────
  await test('prologue preserved',
    'import React from "react"\n' +
    '\n' +
    '%div hello');

  // ─── Option Gates ───────────────────────────────────────
  await test('coffeeScriptFormat off', '%div= @user.name',
    { coffeeScriptFormat: false },
    '%div= @user.name');
  await test('statementMerging preserve',
    '- x = 1\n- y = 2',
    { statementMerging: 'preserve' });
  await test('implicitDivExpansion off',
    '.foo\n  .bar baz',
    { implicitDivExpansion: false });

  // ─── Void Elements ─────────────────────────────────────
  await test('void element br', '%br');

  // Summary
  console.log('\n' + '━'.repeat(80));
  console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('━'.repeat(80));
  process.exit(failed > 0 ? 1 : 0);
}

run();