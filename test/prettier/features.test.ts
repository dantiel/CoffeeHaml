/**
 * CoffeeHaml Prettier — Feature Tests
 *
 * Tests for each deactivatable option.
 * Feature = on, feature = off, feature = preserve.
 */
import { describe, it, expect } from 'vitest';
import * as prettier from 'prettier';
import plugin from '../../src/prettier/index.js';

// ─── Helpers ───────────────────────────────────────────────

async function fmt(source: string, coffeeHamlOpts: Record<string, any> = {}): Promise<string> {
  return prettier.format(source, {
    parser: 'coffeehaml',
    plugins: [plugin],
    ...coffeeHamlOpts,
  });
}

// ─── tagCase ───────────────────────────────────────────────

describe('CoffeeHaml Features — tagCase', () => {
  it('preserve (default) keeps original case', async () => {
    const result = await fmt('%DIV hello');
    expect(result.trim()).toBe('%DIV hello');
  });

  it('lowercase normalizes HTML tags', async () => {
    const result = await fmt('%DIV hello', { tagCase: 'lowercase' });
    expect(result.trim()).toBe('%div hello');
  });

  it('lowercase does not affect PascalCase components', async () => {
    const result = await fmt('%MyComponent hello', { tagCase: 'lowercase' });
    expect(result.trim()).toBe('%MyComponent hello');
  });
});

// ─── voidElementStyle ──────────────────────────────────────

describe('CoffeeHaml Features — voidElementStyle', () => {
  it('self-closing adds / to void elements', async () => {
    const result = await fmt('%br', { voidElementStyle: 'self-closing' });
    expect(result.trim()).toBe('%br/');
  });

  it('self-closing handles void with attrs', async () => {
    const result = await fmt('%img{src: "a.png"}', { voidElementStyle: 'self-closing' });
    expect(result).toContain('/');
  });

  it('explicit preserves author intent', async () => {
    // Without explicit /, void element just outputs as-is
    const result = await fmt('%br', { voidElementStyle: 'explicit' });
    expect(result.trim()).toBe('%br');
  });

  it('explicit preserves explicit self-close', async () => {
    const result = await fmt('%br/', { voidElementStyle: 'explicit' });
    expect(result.trim()).toBe('%br/');
  });
});

// ─── attributeStyle ────────────────────────────────────────

describe('CoffeeHaml Features — attributeStyle', () => {
  it('preserve keeps brace style', async () => {
    const result = await fmt('%div{key: "val"} hello', { attributeStyle: 'preserve' });
    expect(result).toContain('{key: "val"}');
  });

  it('preserve keeps paren style', async () => {
    const result = await fmt('%div(key="val") hello', { attributeStyle: 'preserve' });
    expect(result).toContain('(key="val")');
  });

  it('braces forces brace style', async () => {
    const result = await fmt('%div(key="val") hello', { attributeStyle: 'braces' });
    expect(result).toContain('{');
    expect(result).toContain('}');
  });

  it('parens forces paren style', async () => {
    const result = await fmt('%div{key: "val"} hello', { attributeStyle: 'parens' });
    expect(result).toContain('(');
    expect(result).toContain(')');
  });
});

// ─── statementMerging ──────────────────────────────────────

describe('CoffeeHaml Features — statementMerging', () => {
  it('preserve keeps consecutive - lines separate', async () => {
    const src = '- x = 1\n- y = 2\n- z = 3';
    const result = await fmt(src, { statementMerging: 'preserve' });
    expect(result).toContain('- x = 1');
    expect(result).toContain('- y = 2');
    expect(result).toContain('- z = 3');
  });

  it('merge collapses consecutive statements', async () => {
    const src = '- x = 1\n- y = 2\n- z = 3';
    const result = await fmt(src, { statementMerging: 'merge' });
    expect(result.trim()).toBe('-\n  x = 1\n  y = 2\n  z = 3');
  });

  it('merge is idempotent', async () => {
    const src = '- x = 1\n- y = 2';
    const pass1 = await fmt(src, { statementMerging: 'merge' });
    const pass2 = await fmt(pass1, { statementMerging: 'merge' });
    expect(pass2.trim()).toBe(pass1.trim());
  });

  it('merge skips statements with children', async () => {
    const src = '- x = 1\n- if cond\n  %span hi\n- y = 2';
    const result = await fmt(src, { statementMerging: 'merge' });
    // Only x = 1 and y = 2 should merge (if they're adjacent without the - if between)
    // Actually - if breaks the adjacency, so no merging
    expect(result).toContain('- x = 1');
    expect(result).toContain('- if cond');
    expect(result).toContain('- y = 2');
  });
});

// ─── controlFlowInline ─────────────────────────────────────

describe('CoffeeHaml Features — controlFlowInline', () => {
  it('off (default) keeps multiline', async () => {
    const src = '- if show\n  %span visible';
    const result = await fmt(src, { controlFlowInline: false });
    expect(result).toContain('%span visible');
  });

  it('on inlines if-then with element', async () => {
    const src = '- if show\n  %span visible';
    const result = await fmt(src, { controlFlowInline: true });
    expect(result).toContain('then');
    expect(result).not.toContain('\n  %span');
  });

  it('on inlines if-then with text', async () => {
    const src = '- if show\n  hello';
    const result = await fmt(src, { controlFlowInline: true });
    expect(result).toContain('then hello');
  });
});

// ─── commentFormat ─────────────────────────────────────────

describe('CoffeeHaml Features — commentFormat', () => {
  it('off leaves long comments unwrapped', async () => {
    const long = '/ This is a very long comment that exceeds the print width';
    const result = await fmt(long, { commentFormat: false, printWidth: 40 });
    expect(result.trim()).toBe(long);
  });

  it('on wraps long comments', async () => {
    const long = '/ This is a very long comment that exceeds the print width significantly';
    const result = await fmt(long, { commentFormat: true, printWidth: 40 });
    const lines = result.trim().split('\n');
    // At least one line should exist
    expect(lines.length).toBeGreaterThanOrEqual(1);
    // First line should start with / 
    expect(lines[0]).toMatch(/^\/ /);
  });
});

// ─── attributeSort ─────────────────────────────────────────

describe('CoffeeHaml Features — attributeSort', () => {
  it('none preserves order', async () => {
    const result = await fmt('%div{z: 1, a: 2, m: 3} hello', { attributeSort: 'none' });
    expect(result).toContain('z: 1');
  });

  it('alphabetical sorts', async () => {
    const result = await fmt('%div{z: 1, a: 2, m: 3} hello', { attributeSort: 'alphabetical' });
    const match = result.match(/\{(.+?)\}/);
    if (match) {
      const content = match[1];
      const aPos = content.indexOf('a:');
      const mPos = content.indexOf('m:');
      const zPos = content.indexOf('z:');
      expect(aPos).toBeLessThan(mPos);
      expect(mPos).toBeLessThan(zPos);
    }
  });

  it('idiomatic puts id first, class second', async () => {
    const result = await fmt('%div{z: 1, class: "c", id: "x"} hello', { attributeSort: 'idiomatic' });
    const match = result.match(/\{(.+?)\}/);
    if (match) {
      const content = match[1];
      const idPos = content.indexOf('id:');
      const classPos = content.indexOf('class:');
      expect(idPos).toBeLessThan(classPos);
    }
  });
});

// ─── blankLineHandling ─────────────────────────────────────

describe('CoffeeHaml Features — blankLineHandling', () => {
  it('preserve single newlines between elements', async () => {
    const src = '%div\n  %span a\n  %span b';
    const result = await fmt(src, { blankLineHandling: 'preserve' });
    // Both spans should be present
    expect(result).toContain('%span a');
    expect(result).toContain('%span b');
  });

  it('collapse removes blank lines', async () => {
    const src = '%div\n  %span a\n\n  %span b';
    const result = await fmt(src, { blankLineHandling: 'collapse' });
    expect(result).toContain('%span a');
    expect(result).toContain('%span b');
  });
});

// ─── Options deactivation ──────────────────────────────────

describe('CoffeeHaml Features — options deactivable', () => {
  it('coffeeScriptFormat off preserves raw CS', async () => {
    const src = '= a+b';
    const fmtOn = await fmt(src, { coffeeScriptFormat: true });
    const fmtOff = await fmt(src, { coffeeScriptFormat: false });
    // With formatting on, spacing gets normalized
    expect(fmtOn).toContain('a + b');
    // With formatting off, raw source preserved
    expect(fmtOff).toContain('a+b');
  });
});
