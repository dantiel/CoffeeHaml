import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/lexer.js';
import { TokenType } from '../src/lexer.js';

describe('Lexer', () => {
  it('tokenizes a simple element', () => {
    const tokens = tokenize('%div');
    const tag = tokens.find(t => t.type === TokenType.TAG);
    expect(tag?.value).toBe('div');
  });

  it('tokenizes element with class', () => {
    const tokens = tokenize('%div.container');
    const tag = tokens.find(t => t.type === TokenType.TAG);
    const cls = tokens.find(t => t.type === TokenType.CLASS);
    expect(tag?.value).toBe('div');
    expect(cls?.value).toBe('container');
  });

  it('tokenizes element with id', () => {
    const tokens = tokenize('%div#main');
    const id = tokens.find(t => t.type === TokenType.ID);
    expect(id?.value).toBe('main');
  });

  it('tokenizes element with multiple classes and id', () => {
    const tokens = tokenize('%div.container.active#main');
    const classes = tokens.filter(t => t.type === TokenType.CLASS);
    const ids = tokens.filter(t => t.type === TokenType.ID);
    expect(classes.map(c => c.value)).toEqual(['container', 'active']);
    expect(ids.map(i => i.value)).toEqual(['main']);
  });

  it('tokenizes element with brace attributes', () => {
    const tokens = tokenize('%div{key: "value"}');
    const attrs = tokens.find(t => t.type === TokenType.ATTRS_BRACE);
    expect(attrs?.value).toBe('key: "value"');
  });

  it('tokenizes element with paren attributes', () => {
    const tokens = tokenize('%div(key: "value")');
    const attrs = tokens.find(t => t.type === TokenType.ATTRS_PAREN);
    expect(attrs?.value).toBe('key: "value"');
  });

  it('tokenizes escaped output', () => {
    const tokens = tokenize('= name');
    const out = tokens.find(t => t.type === TokenType.OUTPUT);
    expect(out?.value).toBe('name');
  });

  it('tokenizes unescaped output', () => {
    const tokens = tokenize('!= rawHtml');
    const out = tokens.find(t => t.type === TokenType.OUTPUT_UNESC);
    expect(out?.value).toBe('rawHtml');
  });

  it('tokenizes control flow', () => {
    const tokens = tokenize('- if condition');
    const ctrl = tokens.find(t => t.type === TokenType.CONTROL);
    expect(ctrl?.value).toBe('if condition');
  });

  it('tokenizes for loop', () => {
    const tokens = tokenize('- for item in items');
    const ctrl = tokens.find(t => t.type === TokenType.CONTROL);
    expect(ctrl?.value).toBe('for item in items');
  });

  it('handles indentation (INDENT/DEDENT)', () => {
    const src = `%div\n  %span\n  %span\n%footer`;
    const tokens = tokenize(src);
    const indents = tokens.filter(t => t.type === TokenType.INDENT);
    const dedents = tokens.filter(t => t.type === TokenType.DEDENT);
    expect(indents.length).toBe(1);
    expect(dedents.length).toBe(1);
  });

  it('handles nested indentation', () => {
    const src = `%div\n  %ul\n    %li\n    %li\n  %footer`;
    const tokens = tokenize(src);
    const indents = tokens.filter(t => t.type === TokenType.INDENT);
    const dedents = tokens.filter(t => t.type === TokenType.DEDENT);
    // Two INDENTs: div→ul (2 spaces), ul→li (4 spaces)
    // Two DEDENTs: li→footer (4→2), footer→EOF (2→0)
    expect(indents.length).toBe(2);
    expect(dedents.length).toBe(2);
  });

  it('tokenizes implicit div with class', () => {
    const tokens = tokenize('.container');
    const cls = tokens.find(t => t.type === TokenType.CLASS);
    expect(cls?.value).toBe('container');
  });

  it('tokenizes implicit div with id', () => {
    const tokens = tokenize('#main');
    const id = tokens.find(t => t.type === TokenType.ID);
    expect(id?.value).toBe('main');
  });

  it('tokenizes component (uppercase tag)', () => {
    const tokens = tokenize('%MyComponent');
    const tag = tokens.find(t => t.type === TokenType.TAG);
    expect(tag?.value).toBe('MyComponent');
  });

  it('tokenizes self-closing element', () => {
    const tokens = tokenize('%br/');
    const tag = tokens.find(t => t.type === TokenType.TAG);
    const selfClose = tokens.find(t => t.type === TokenType.SELF_CLOSE);
    expect(tag?.value).toBe('br');
    expect(selfClose).toBeTruthy();
  });

  it('tokenizes Haml comment', () => {
    const tokens = tokenize('-# this is a comment');
    const comment = tokens.find(t => t.type === TokenType.COMMENT);
    expect(comment?.value).toBe('this is a comment');
  });

  it('tokenizes HTML comment', () => {
    const tokens = tokenize('/ this is an HTML comment');
    const comment = tokens.find(t => t.type === TokenType.HTML_COMMENT);
    expect(comment?.value).toBe('this is an HTML comment');
  });

  it('tokenizes filter', () => {
    const tokens = tokenize(':css\n  .foo { color: red; }');
    const filter = tokens.find(t => t.type === TokenType.FILTER);
    expect(filter?.value).toContain('css');
  });

  it('tokenizes doctype', () => {
    const tokens = tokenize('!!! 5');
    const doctype = tokens.find(t => t.type === TokenType.DOCTYPE);
    expect(doctype?.value).toBe('5');
  });

  it('tokenizes inline text after element', () => {
    const tokens = tokenize('%span Hello World');
    const tag = tokens.find(t => t.type === TokenType.TAG);
    const text = tokens.find(t => t.type === TokenType.TEXT);
    expect(tag?.value).toBe('span');
    expect(text?.value).toBe('Hello World');
  });
});
