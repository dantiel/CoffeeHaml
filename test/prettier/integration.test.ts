/**
 * CoffeeHaml Prettier — Integration Tests
 *
 * End-to-end formatting with the plugin, covering all
 * structural constructs and option gates.
 */
import { describe, it, expect } from 'vitest';
import * as prettier from 'prettier';
import plugin from '../../src/prettier/index.js';

// ─── Helpers ───────────────────────────────────────────────

async function fmt(source: string, opts: Record<string, any> = {}): Promise<string> {
  return prettier.format(source, {
    parser: 'coffeehaml',
    plugins: [plugin],
    ...opts,
  });
}

async function fmtOpts(source: string, coffeeHamlOpts: Record<string, any>): Promise<string> {
  return prettier.format(source, {
    parser: 'coffeehaml',
    plugins: [plugin],
    ...coffeeHamlOpts,
  });
}

const PRINT_WIDTH_40 = { printWidth: 40 };

// ─── Basic Constructs ──────────────────────────────────────

describe('CoffeeHaml Prettier — Integration', () => {
  describe('elements', () => {
    it('formats a simple element', async () => {
      const result = await fmt('%div hello');
      expect(result.trim()).toBe('%div hello');
    });

    it('formats element with inline text', async () => {
      const result = await fmt('%span Hello World');
      expect(result.trim()).toBe('%span Hello World');
    });

    it('formats nested elements', async () => {
      const result = await fmt('%div\n  %span hello');
      expect(result).toContain('%div');
      expect(result).toContain('%span hello');
    });

    it('preserves deep nesting', async () => {
      const src = '%div\n  %ul\n    %li one\n    %li two\n  %p footer';
      const result = await fmt(src);
      expect(result).toContain('%div');
      expect(result).toContain('%li one');
      expect(result).toContain('%li two');
      expect(result).toContain('%p footer');
    });
  });

  describe('implicit divs', () => {
    it('formats .class', async () => {
      const result = await fmt('.my-class hello');
      expect(result.trim()).toBe('.my-class hello');
    });

    it('formats #id', async () => {
      const result = await fmt('#main hello');
      expect(result.trim()).toBe('#main hello');
    });

    it('formats .class#id', async () => {
      const result = await fmt('.container#main hello');
      expect(result.trim()).toBe('.container#main hello');
    });
  });

  // ─── Output ────────────────────────────────────────────

  describe('output (=)', () => {
    it('formats = expression', async () => {
      const result = await fmt('= props.title');
      expect(result.trim()).toBe('= props.title');
    });

    it('formats != expression', async () => {
      const result = await fmt('!= htmlString');
      expect(result.trim()).toBe('!= htmlString');
    });
  });

  // ─── Control Flow ──────────────────────────────────────

  describe('control flow', () => {
    it('formats - if', async () => {
      const src = '- if show\n  %span visible';
      const result = await fmt(src);
      expect(result).toContain('- if show');
      expect(result).toContain('%span visible');
    });

    it('formats - for', async () => {
      const src = '- for item in items\n  %li= item';
      const result = await fmt(src);
      expect(result).toContain('- for item in items');
      expect(result).toContain('%li= item');
    });

    it('formats - statement', async () => {
      const src = '- console.log "hello"\n%div after';
      const result = await fmt(src);
      expect(result).toContain('- console.log "hello"');
      expect(result).toContain('%div after');
    });

    it('chains else', async () => {
      const src = '- if a\n  %span A\n- else\n  %span B';
      const result = await fmt(src);
      expect(result).toContain('- if a');
      expect(result).toContain('- else');
      expect(result).toContain('%span A');
      expect(result).toContain('%span B');
    });
  });

  // ─── Attributes ────────────────────────────────────────

  describe('attributes', () => {
    it('formats brace attributes', async () => {
      const result = await fmt('%div{key: "val"} hello');
      expect(result).toContain('{key: "val"}');
    });

    it('formats paren attributes', async () => {
      const result = await fmt('%div(key="val") hello');
      expect(result).toContain('(key="val")');
    });

    it('preserves attribute style', async () => {
      const braceResult = await fmt('%div{key: "val"} hello');
      expect(braceResult).toContain('{key: "val"}');

      const parenResult = await fmt('%div(key="val") hello');
      expect(parenResult).toContain('(key="val")');
    });
  });

  // ─── Comments / Filters / Doctype ──────────────────────

  describe('misc', () => {
    it('formats comments', async () => {
      const result = await fmt('/ HTML comment');
      expect(result.trim()).toBe('/ HTML comment');

      const hamlResult = await fmt('-# HAML comment');
      expect(hamlResult.trim()).toBe('-# HAML comment');
    });

    it('formats doctype', async () => {
      const result = await fmt('!!! 5\n%html');
      expect(result).toContain('!!! 5');
    });

    it('formats filters', async () => {
      const src = ':coffeescript\n  x = 1\n  y = 2';
      const result = await fmt(src);
      expect(result).toContain(':coffeescript');
    });
  });

  // ─── Idempotency ───────────────────────────────────────

  describe('idempotency', () => {
    it('is idempotent for simple elements', async () => {
      const src = '%div\n  %span hello';
      const pass1 = await fmt(src);
      const pass2 = await fmt(pass1);
      expect(pass2.trim()).toBe(pass1.trim());
    });

    it('is idempotent for control flow', async () => {
      const src = '- if show\n  %span visible\n- else\n  %span hidden';
      const pass1 = await fmt(src);
      const pass2 = await fmt(pass1);
      expect(pass2.trim()).toBe(pass1.trim());
    });

    it('is idempotent for complex nesting', async () => {
      const src = '%div\n  %header\n    %h1= title\n  %main\n    %p content';
      const pass1 = await fmt(src);
      const pass2 = await fmt(pass1);
      expect(pass2.trim()).toBe(pass1.trim());
    });
  });
});
