/**
 * CoffeeScript Formatter — Comprehensive Tests
 *
 * Tests for the token-based CoffeeScript formatting engine.
 * Covers spacing normalization, line wrapping, edge cases, and fallbacks.
 */

import { describe, it, expect } from 'vitest';
import { formatCoffeeScript, formatCoffeeScriptBlock } from '../../src/prettier/coffeescript-formatter.js';

// ─── Helpers ───────────────────────────────────────────────

function fmt(source: string, printWidth = 80): string {
  return formatCoffeeScript(source, { printWidth, methodChainAlign: true, enabled: true });
}

function fmtNoWrap(source: string): string {
  return formatCoffeeScript(source, { printWidth: 80, methodChainAlign: false, enabled: true });
}

// ─── Spacing: Binary Operators ────────────────────────────

describe('CoffeeScript Formatter — Spacing', () => {
  describe('binary operators', () => {
    it('adds spaces around +', () => {
      expect(fmt('a+b')).toBe('a + b');
      expect(fmt('a +b')).toBe('a + b');
      expect(fmt('a+ b')).toBe('a + b');
      expect(fmt('a + b')).toBe('a + b');
    });

    it('adds spaces around -', () => {
      expect(fmt('a-b')).toBe('a - b');
      expect(fmt('a -b')).toBe('a - b');
      expect(fmt('a- b')).toBe('a - b');
    });

    it('adds spaces around *', () => {
      expect(fmt('a*b')).toBe('a * b');
    });

    it('adds spaces around /', () => {
      expect(fmt('a/b')).toBe('a / b');
    });

    it('adds spaces around %', () => {
      expect(fmt('a%b')).toBe('a % b');
    });

    it('adds spaces around **', () => {
      expect(fmt('a**b')).toBe('a ** b');
    });

    it('preserves unary - (no space)', () => {
      expect(fmt('-x')).toBe('-x');
      expect(fmt('a + -b')).toBe('a + -b');
    });

    it('preserves unary + (no space)', () => {
      expect(fmt('+x')).toBe('+x');
    });

    it('adds spaces around arrow =>', () => {
      expect(fmt('(x)=>y')).toBe('(x) => y');
      expect(fmt('(x) =>y')).toBe('(x) => y');
      expect(fmt('(x)=> y')).toBe('(x) => y');
    });

    it('adds spaces around thin arrow ->', () => {
      expect(fmt('(x)->y')).toBe('(x) -> y');
      expect(fmt('(x)->y * 2')).toBe('(x) -> y * 2');
    });
  });

  // ─── Comparison operators ─────────────────────────────────

  describe('comparison operators', () => {
    it('adds spaces around ==', () => {
      expect(fmt('a==b')).toBe('a == b');
    });

    it('adds spaces around !=', () => {
      expect(fmt('a!=b')).toBe('a != b');
    });

    it('adds spaces around < and >', () => {
      expect(fmt('a<b')).toBe('a < b');
      expect(fmt('a>b')).toBe('a > b');
    });

    it('adds spaces around <= and >=', () => {
      expect(fmt('a<=b')).toBe('a <= b');
      expect(fmt('a>=b')).toBe('a >= b');
    });

    it('adds spaces around CoffeeScript is/isnt', () => {
      expect(fmt('a is b')).toBe('a is b');
      expect(fmt('a  is  b')).toBe('a is b');
      expect(fmt('a isnt b')).toBe('a isnt b');
    });
  });

  // ─── Assignment operators ─────────────────────────────────

  describe('assignment operators', () => {
    it('adds spaces around =', () => {
      expect(fmt('x=1')).toBe('x = 1');
    });

    it('adds spaces around += -= *= /=', () => {
      expect(fmt('x+=1')).toBe('x += 1');
      expect(fmt('x-=1')).toBe('x -= 1');
      expect(fmt('x*=1')).toBe('x *= 1');
      expect(fmt('x/=1')).toBe('x /= 1');
    });
  });

  // ─── Logical operators ───────────────────────────────────

  describe('logical operators', () => {
    it('adds spaces around &&', () => {
      expect(fmt('a&&b')).toBe('a && b');
    });

    it('adds spaces around ||', () => {
      expect(fmt('a||b')).toBe('a || b');
    });

    it('adds spaces around and/or', () => {
      expect(fmt('a and b')).toBe('a and b');
      expect(fmt('a  and  b')).toBe('a and b');
      expect(fmt('a or b')).toBe('a or b');
    });
  });

  // ─── Method calls and property access ────────────────────

  describe('method calls and property access', () => {
    it('preserves .property access (no space)', () => {
      expect(fmt('obj.prop')).toBe('obj.prop');
      expect(fmt('obj .prop')).toBe('obj.prop');
    });

    it('preserves .method() calls (no space before parens)', () => {
      expect(fmt('obj.method()')).toBe('obj.method()');
    });

    it('preserves ?. optional chaining', () => {
      expect(fmt('obj?.prop')).toBe('obj?.prop');
      expect(fmt('obj?.method()')).toBe('obj?.method()');
    });

    it('preserves @property access', () => {
      expect(fmt('@prop')).toBe('@prop');
      expect(fmt('@name')).toBe('@name');
    });
  });

  // ─── Function calls ──────────────────────────────────────

  describe('function calls', () => {
    it('preserves no space before call parens', () => {
      expect(fmt('fn()')).toBe('fn()');
      expect(fmt('fn ( )')).toBe('fn()');
    });

    it('adds space after comma in args', () => {
      expect(fmt('fn(a,b)')).toBe('fn(a, b)');
      expect(fmt('fn(a, b)')).toBe('fn(a, b)');
      expect(fmt('fn(a,b,c)')).toBe('fn(a, b, c)');
    });

    it('handles nested calls', () => {
      expect(fmt('fn(a,g(x,y))')).toBe('fn(a, g(x, y))');
    });

    it('handles empty calls', () => {
      expect(fmt('fn()')).toBe('fn()');
    });

    it('preserves space for implicit calls', () => {
      // console.log x → implicit call, preserves space
      expect(fmt('console.log x')).toBe('console.log x');
    });
  });

  // ─── Object literals ─────────────────────────────────────

  describe('object literals', () => {
    it('adds space after : in objects', () => {
      expect(fmt('{a:b}')).toBe('{a: b}');
      expect(fmt('{a :b}')).toBe('{a: b}');
    });

    it('adds space after comma in objects', () => {
      expect(fmt('{a:1,b:2}')).toBe('{a: 1, b: 2}');
    });

    it('handles nested objects', () => {
      expect(fmt('{a:{b:c}}')).toBe('{a: {b: c}}');
    });

    it('handles empty objects', () => {
      expect(fmt('{}')).toBe('{}');
    });
  });

  // ─── Array literals ──────────────────────────────────────

  describe('array literals', () => {
    it('adds space after comma in arrays', () => {
      expect(fmt('[1,2,3]')).toBe('[1, 2, 3]');
      expect(fmt('[a,b]')).toBe('[a, b]');
    });

    it('handles empty arrays', () => {
      expect(fmt('[]')).toBe('[]');
    });
  });

  // ─── Keywords ────────────────────────────────────────────

  describe('keywords', () => {
    it('preserves for...in spacing', () => {
      expect(fmt('for item in items')).toBe('for item in items');
    });

    it('preserves for...of spacing', () => {
      expect(fmt('for item of items')).toBe('for item of items');
    });

    it('handles when clause in comprehensions', () => {
      expect(fmt('for item in items when item.active'))
        .toBe('for item in items when item.active');
    });

    it('handles by clause in comprehensions', () => {
      expect(fmt('for item in items by 2'))
        .toBe('for item in items by 2');
    });
  });

  // ─── Complex expressions ─────────────────────────────────

  describe('complex expressions', () => {
    it('handles filter with arrow in object', () => {
      // Embedded expression: items.filter (item) => item.active
      const result = fmt('items.filter (item) => item.active');
      expect(result).toContain('items.filter');
      expect(result).toContain('(item)');
      expect(result).toContain('=>');
      expect(result).toContain('item.active');
    });

    it('handles map with arrow returning object', () => {
      const result = fmt('items.map (item) => key: item.id');
      expect(result).toContain('items.map');
      expect(result).toContain('key: item.id');
    });

    it('handles ternary-like expressions', () => {
      expect(fmt('if x then y else z')).toBe('if x then y else z');
    });

    it('handles not keyword', () => {
      expect(fmt('not x')).toBe('not x');
      expect(fmt('not  x')).toBe('not x');
    });
  });
});

// ─── Line Wrapping ─────────────────────────────────────────

describe('CoffeeScript Formatter — Line Wrapping', () => {
  describe('method chain wrapping', () => {
    it('does not wrap short chains', () => {
      const result = fmt('items.map (i) => i.name');
      expect(result).not.toContain('\n');
    });

    it('wraps long method chains', () => {
      const result = fmt('items.filter((i) => i.active).map((i) => i.name).sort()');
      // Should break into multiple lines
      const lines = result.split('\n');
      expect(lines.length).toBeGreaterThan(1);
      // Each continuation line should start with .
      expect(lines[1].trim()).toMatch(/^\./);
      expect(lines[2]?.trim()).toMatch(/^\./);
    });

    it('wraps chains with 3+ methods', () => {
      const result = fmt('a.b().c().d().e()');
      const lines = result.split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('disabled wrapping', () => {
    it('keeps chains inline when methodChainAlign is false', () => {
      const result = fmtNoWrap('items.filter((i) => i.active).map((i) => i.name).sort()');
      expect(result).not.toContain('\n');
    });
  });

  describe('depth-aware wrapping', () => {
    it('does not break dots inside brackets', () => {
      const result = fmt('obj.method(fn.a.b)');
      // The .a.b inside parens should NOT be broken
      const afterParen = result.substring(result.indexOf('('));
      expect(afterParen).not.toContain('\n');
    });
  });
});

// ─── Fallback / Error Handling ─────────────────────────────

describe('CoffeeScript Formatter — Error Handling', () => {
  it('returns source unchanged on parse errors', () => {
    const bad = '{{{{unclosed';
    // Should not throw, should return original
    const result = formatCoffeeScript(bad, { enabled: true });
    expect(typeof result).toBe('string');
  });

  it('returns empty string unchanged', () => {
    expect(fmt('')).toBe('');
    expect(fmt('  ')).toBe('  ');
  });

  it('returns source unchanged when disabled', () => {
    const source = 'a+b';
    const result = formatCoffeeScript(source, { enabled: false });
    expect(result).toBe(source); // Identical, not formatted
  });
});

// ─── Block Formatting ──────────────────────────────────────

describe('CoffeeScript Formatter — Block Formatting', () => {
  it('formats each line independently', () => {
    const block = 'x = 1\ny =2\nz  =  3';
    const result = formatCoffeeScriptBlock(block, { enabled: true });
    expect(result).toContain('x = 1');
    expect(result).toContain('y = 2');
    expect(result).toContain('z = 3');
  });

  it('preserves indentation', () => {
    const block = '  x = 1\n  y=2';
    const result = formatCoffeeScriptBlock(block, { enabled: true });
    expect(result).toContain('  x = 1');
    expect(result).toContain('  y = 2');
  });

  it('keeps blank lines', () => {
    const block = 'x = 1\n\ny = 2';
    const result = formatCoffeeScriptBlock(block, { enabled: true });
    const lines = result.split('\n');
    expect(lines.some(l => l.trim() === '')).toBe(true);
  });

  it('returns empty block unchanged', () => {
    expect(formatCoffeeScriptBlock('', { enabled: true })).toBe('');
  });
});

// ─── Specific CoffeeHaml Expression Patterns ───────────────

describe('CoffeeScript Formatter — CoffeeHaml Patterns', () => {
  describe('attribute expressions', () => {
    it('formats object literal attributes', () => {
      // From: %div{class:compute(x),id:"main"}
      expect(fmt('class: compute(x)')).toBe('class: compute(x)');
      expect(fmt('class:compute(x),id:"main"')).toBe('class: compute(x), id: "main"');
    });

    it('formats spread attributes', () => {
      expect(fmt('props...')).toBe('props...');
    });

    it('formats complex attribute values', () => {
      expect(fmt('onClick: (e) => handler(e, data)'))
        .toBe('onClick: (e) => handler(e, data)');
    });
  });

  describe('output expressions (=)', () => {
    it('formats simple interpolation', () => {
      expect(fmt('item.name')).toBe('item.name');
    });

    it('formats conditional output', () => {
      expect(fmt('if condition then yes else no'))
        .toBe('if condition then yes else no');
    });

    it('formats JSX-like output', () => {
      expect(fmt('jsx("div", null)')).toBe('jsx("div", null)');
    });
  });

  describe('control flow conditions', () => {
    it('formats if condition', () => {
      expect(fmt('items.length > 0')).toBe('items.length > 0');
    });

    it('formats compound conditions', () => {
      expect(fmt('x > 10 and y < 20')).toBe('x > 10 and y < 20');
    });

    it('formats for...in conditions', () => {
      expect(fmt('for item, index in items when item.active'))
        .toBe('for item, index in items when item.active');
    });
  });
});
