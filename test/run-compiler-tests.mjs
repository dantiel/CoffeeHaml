/**
 * Compiler Statement Tests — `- ` line → JS compilation.
 * Run: node test/run-compiler-tests.mjs
 */
import { compileStatement } from '../dist/expressions.js';

let passed = 0;
let failed = 0;

function eq(actual, expected, label) {
  if (actual !== expected) {
    failed++;
    console.log(`  \u2717 ${label}`);
    console.log(`      expected: ${JSON.stringify(expected)}`);
    console.log(`      got:      ${JSON.stringify(actual)}`);
  } else {
    passed++;
    console.log(`  \u2713 ${label}`);
  }
}

// Simple assignment
eq(compileStatement('a = 1'), 'const a = 1', 'simple assignment');

// Multiple statements
eq(compileStatement('a = 1; b = 2'), 'const a = 1; const b = 2', 'multi-statement');

// Object literal (0.7.6 regression)
eq(
  compileStatement('DEFAULT_GYRO = { roll: 0, pitch: 0, yaw: 0 }'),
  'const DEFAULT_GYRO = { roll: 0, pitch: 0, yaw: 0 }',
  'object literal',
);

// Array literal
eq(compileStatement('ITEMS = [1, 2, 3]'), 'const ITEMS = [1, 2, 3]', 'array literal');

// Array destructuring (0.7.7 regression)
eq(
  compileStatement("[activeTab, setActiveTab] = useState 'servos'"),
  "const [activeTab, setActiveTab] = useState('servos')",
  'array destructuring',
);

// Array destructuring plus trailing statement
eq(
  compileStatement('[a, b] = [1, 2]; c = 3'),
  'const [a, b] = [1, 2]; const c = 3',
  'destructuring + trailing statement',
);

// Object destructuring shorthand
eq(compileStatement('{ x, y } = obj'), 'const {x, y} = obj', 'object destructuring shorthand');

// Object destructuring with aliases
eq(
  compileStatement('{ x: a, y: b } = obj'),
  'const { x: a, y: b } = obj',
  'object destructuring aliased',
);

// Chained assignment falls back to var (both names stay declared)
eq(compileStatement('a = b = 1'), 'var a, b; a = b = 1', 'chained assignment fallback');

console.log(`\n${'\u2501'.repeat(40)}`);
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'\u2501'.repeat(40)}`);

if (failed > 0) process.exit(1);
