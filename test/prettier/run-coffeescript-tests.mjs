/**
 * CoffeeScript Formatter Tests
 * Run: node test/prettier/run-coffeescript-tests.mjs
 */
import { formatCoffeeScript, formatCoffeeScriptBlock } from '../../dist/prettier/coffeescript-formatter.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (e) {
    failed++;
    console.log(`  \u2717 ${name}`);
    console.log(`    ${e.message}`);
  }
}

function eq(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg ? msg + ': ' : ''}expected "${expected}", got "${actual}"`);
  }
}

function fmt(source, opts = {}) {
  return formatCoffeeScript(source, {
    printWidth: opts.printWidth ?? 80,
    methodChainAlign: opts.methodChainAlign ?? true,
    enabled: opts.enabled ?? true,
  });
}

function fmtBlock(source, opts = {}) {
  return formatCoffeeScriptBlock(source, {
    printWidth: opts.printWidth ?? 80,
    methodChainAlign: opts.methodChainAlign ?? true,
    enabled: opts.enabled ?? true,
  });
}

// ═══════════════════════════════════════════════════════════
// Spacing: Binary Operators
// ═══════════════════════════════════════════════════════════

console.log('\n── CS Formatter: Binary Operators ──');

test('adds spaces around +', () => {
  eq(fmt('a+b'), 'a + b');
  eq(fmt('a + b'), 'a + b');
});

test('adds spaces around -', () => {
  eq(fmt('a-b'), 'a - b');
});

test('adds spaces around *', () => {
  eq(fmt('a*b'), 'a * b');
});

test('adds spaces around /', () => {
  eq(fmt('a/b'), 'a / b');
});

test('adds spaces around %', () => {
  eq(fmt('a%b'), 'a % b');
});

test('adds spaces around comparison', () => {
  eq(fmt('a==b'), 'a == b');
  eq(fmt('a!=b'), 'a != b');
  eq(fmt('a<b'), 'a < b');
  eq(fmt('a>b'), 'a > b');
});

test('adds spaces around logic', () => {
  eq(fmt('a&&b'), 'a && b');
  eq(fmt('a||b'), 'a || b');
});

test('handles compound assignment', () => {
  eq(fmt('a+=b'), 'a += b');
  eq(fmt('a-=b'), 'a -= b');
});

// ═══════════════════════════════════════════════════════════
// Spacing: Unary Operators
// ═══════════════════════════════════════════════════════════

console.log('\n── CS Formatter: Unary ──');

test('unary - has no space', () => {
  eq(fmt('-x'), '-x');
});

test('binary - has space', () => {
  eq(fmt('a-b'), 'a - b');
});

test('nested unary in binary', () => {
  eq(fmt('a+-b'), 'a + -b');
});

// ═══════════════════════════════════════════════════════════
// Keywords preserved
// ═══════════════════════════════════════════════════════════

console.log('\n── CS Formatter: Keywords ──');

test('preserves is keyword', () => {
  eq(fmt('a is b'), 'a is b');
});

test('preserves isnt keyword', () => {
  eq(fmt('a isnt b'), 'a isnt b');
});

test('preserves and keyword', () => {
  eq(fmt('a and b'), 'a and b');
});

test('preserves or keyword', () => {
  eq(fmt('a or b'), 'a or b');
});

test('preserves not keyword', () => {
  eq(fmt('not a'), 'not a');
});

// ═══════════════════════════════════════════════════════════
// Method chains
// ═══════════════════════════════════════════════════════════

console.log('\n── CS Formatter: Method Chains ──');

test('preserves short chain', () => {
  eq(fmt('obj.method()'), 'obj.method()');
});

test('wraps long chain', () => {
  const r = fmt('obj.method1().method2().method3().method4().method5()', { printWidth: 40 });
  // Should have newlines
  if (!r.includes('\n')) {
    throw new Error('expected method chain to wrap');
  }
});

test('disabled chain wrapping', () => {
  const r = fmt('obj.method1().method2().method3()', { methodChainAlign: false });
  eq(r, 'obj.method1().method2().method3()');
});

// ═══════════════════════════════════════════════════════════
// Punctuation
// ═══════════════════════════════════════════════════════════

console.log('\n── CS Formatter: Punctuation ──');

test('normalizes comma spacing', () => {
  eq(fmt('f(a,b)'), 'f(a, b)');
  eq(fmt('f(a ,b)'), 'f(a, b)');
});

test('preserves colon in objects', () => {
  eq(fmt('{a: b}'), '{a: b}');
});

test('preserves @property', () => {
  eq(fmt('@prop'), '@prop');
});

// ═══════════════════════════════════════════════════════════
// Comprehensions
// ═══════════════════════════════════════════════════════════

console.log('\n── CS Formatter: Comprehensions ──');

test('spaces for-in', () => {
  eq(fmt('x for x in xs'), 'x for x in xs');
});

test('spaces for-of', () => {
  eq(fmt('x for x of xs'), 'x for x of xs');
});

test('preserves when', () => {
  eq(fmt('x for x in xs when x > 0'), 'x for x in xs when x > 0');
});

test('preserves by', () => {
  eq(fmt('x for x in xs by 2'), 'x for x in xs by 2');
});

// ═══════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════

console.log('\n── CS Formatter: Edge Cases ──');

test('empty string', () => {
  eq(fmt(''), '');
});

test('disabled returns original', () => {
  eq(fmt('a+b', { enabled: false }), 'a+b');
});

test('idempotent', () => {
  const src = 'a + b * c - d / e';
  eq(fmt(fmt(src)), fmt(src));
});

// ═══════════════════════════════════════════════════════════
// Block formatting
// ═══════════════════════════════════════════════════════════

console.log('\n── CS Formatter: Blocks ──');

test('formats code block', () => {
  const r = fmtBlock('x=1\ny= 2\nz =3');
  eq(r, 'x = 1\ny = 2\nz = 3');
});

test('preserves empty lines in block', () => {
  const r = fmtBlock('x=1\n\ny=2');
  eq(r, 'x = 1\n\ny = 2');
});

// ═══════════════════════════════════════════════════════════

console.log(`\n${'═'.repeat(40)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'═'.repeat(40)}`);

if (failed > 0) process.exit(1);
