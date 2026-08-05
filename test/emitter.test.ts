import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/lexer.js';
import { parse } from '../src/parser.js';
import { emit } from '../src/emitter.js';

function compile(src: string): string {
  const tokens = tokenize(src);
  const ast = parse(tokens).document;
  return emit(ast).code;
}

describe('Emitter', () => {
  it('emits import statement', () => {
    const result = compile('%div');
    expect(result).toContain('import { jsx, jsxs, Fragment }');
  });

  it('emits simple HTML element', () => {
    const result = compile('%div');
    expect(result).toContain('jsx("div", null)');
  });

  it('emits element with attributes', () => {
    const result = compile('%div{id: "main", className: "foo"}');
    expect(result).toContain('id: "main"');
    expect(result).toContain('className');
  });

  it('emits component (uppercase)', () => {
    const result = compile('%Button{onClick: handler}');
    expect(result).toContain('jsx(Button');
  });

  it('emits self-closing element', () => {
    const result = compile('%br/');
    expect(result).toContain('jsx("br", null)');
  });

  it('emits element with single text child', () => {
    const result = compile('%span Hello');
    expect(result).toContain('"Hello"');
    expect(result).toContain('jsxs');
  });

  it('emits nested elements', () => {
    const result = compile(`%div\n  %span A\n  %p B`);
    expect(result).toContain('jsxs("div"');
    expect(result).toContain('jsx("span"');
    expect(result).toContain('jsx("p"');
  });

  it('emits class attribute from .class modifier', () => {
    const result = compile('%div.foo');
    expect(result).toContain('className: "foo"');
  });

  it('emits id from #id modifier', () => {
    const result = compile('%div#main');
    expect(result).toContain('id: "main"');
  });

  it('merges class modifier with class attribute', () => {
    const result = compile('%div.foo{class: "bar"}');
    expect(result).toContain('className');
  });

  it('emits for loop as .map()', () => {
    const result = compile(`- for item in items\n  %li`);
    expect(result).toContain('.map');
    expect(result).toContain('items');
  });

  it('emits if as ternary', () => {
    const result = compile(`- if show\n  %span Visible`);
    expect(result).toContain('?');
    expect(result).toContain(': null');
  });

  it('emits if/else chain', () => {
    const result = compile(`- if a\n  %span A\n- else\n  %span B`);
    expect(result).toContain('?');
    expect(result).toContain(': ');
    expect(result).toContain('jsx("span"');
  });

  it('emits output expression', () => {
    const result = compile('= name');
    expect(result).toContain('name');
  });

  it('emits shorthand attribute', () => {
    const result = compile('%div{onClick}');
    expect(result).toContain('onClick');
  });

  it('strips Haml comments', () => {
    const result = compile('-# secret\n%div');
    expect(result).not.toContain('secret');
    expect(result).toContain('jsx("div"');
  });

  it('emits implicit div', () => {
    const result = compile('.container');
    expect(result).toContain('jsx("div"');
    expect(result).toContain('className: "container"');
  });

  it('handles empty input', () => {
    const result = compile('');
    expect(result).toContain('import');
  });

  it('converts class attribute to className', () => {
    const result = compile('%div{class: "foo"}');
    expect(result).toContain('className');
    expect(result).not.toContain('"class"');
  });

  it('converts for attribute to htmlFor', () => {
    const result = compile('%label{for: "input1"}');
    expect(result).toContain('htmlFor');
    expect(result).not.toContain('"for"');
  });
});