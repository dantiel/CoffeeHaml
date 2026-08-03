import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/lexer.js';
import { parse } from '../src/parser.js';
import { Document, Element, ImplicitDiv, Text, Output, ControlFlow, Comment, Doctype } from '../src/ast.js';

describe('Parser', () => {
  it('parses a simple element', () => {
    const doc = parse(tokenize('%div'));
    expect(doc).toBeInstanceOf(Document);
    expect(doc.children).toHaveLength(1);
    const el = doc.children[0] as Element;
    expect(el.tag).toBe('div');
    expect(el.isComponent).toBe(false);
  });

  it('detects component (uppercase)', () => {
    const doc = parse(tokenize('%Button'));
    const el = doc.children[0] as Element;
    expect(el.isComponent).toBe(true);
  });

  it('parses element with classes', () => {
    const doc = parse(tokenize('%div.container.active'));
    const el = doc.children[0] as Element;
    expect(el.classes).toEqual(['container', 'active']);
  });

  it('parses element with id', () => {
    const doc = parse(tokenize('%div#main'));
    const el = doc.children[0] as Element;
    expect(el.id).toBe('main');
  });

  it('parses element with attributes', () => {
    const doc = parse(tokenize('%div{key: "val"}'));
    const el = doc.children[0] as Element;
    expect(el.attributes).toHaveLength(1);
    expect(el.attributes[0].name).toBe('key');
    expect(el.attributes[0].value.source).toBe('"val"');
  });

  it('parses implicit div', () => {
    const doc = parse(tokenize('.container'));
    const div = doc.children[0] as ImplicitDiv;
    expect(div.classes).toEqual(['container']);
  });

  it('parses implicit div with id', () => {
    const doc = parse(tokenize('#main'));
    const div = doc.children[0] as ImplicitDiv;
    expect(div.id).toBe('main');
  });

  it('parses text', () => {
    const doc = parse(tokenize('Hello World'));
    const text = doc.children[0] as Text;
    expect(text.value).toBe('Hello World');
  });

  it('parses output', () => {
    const doc = parse(tokenize('= name'));
    const out = doc.children[0] as Output;
    expect(out.expression.source).toBe('name');
    expect(out.outputKind).toBe('escaped');
  });

  it('parses unescaped output', () => {
    const doc = parse(tokenize('!= html'));
    const out = doc.children[0] as Output;
    expect(out.expression.source).toBe('html');
    expect(out.outputKind).toBe('unescaped');
  });

  it('parses control flow (if)', () => {
    const doc = parse(tokenize('- if x'));
    const cf = doc.children[0] as ControlFlow;
    expect(cf.controlKind).toBe('if');
    expect(cf.expression.source).toBe('if x');
  });

  it('parses control flow (for)', () => {
    const doc = parse(tokenize('- for item in items'));
    const cf = doc.children[0] as ControlFlow;
    expect(cf.controlKind).toBe('for');
    expect(cf.expression.source).toBe('for item in items');
  });

  it('parses nested elements', () => {
    const src = `%div\n  %span\n  %p`;
    const doc = parse(tokenize(src));
    const div = doc.children[0] as Element;
    expect(div.children).toHaveLength(2);
    expect((div.children[0] as Element).tag).toBe('span');
    expect((div.children[1] as Element).tag).toBe('p');
  });

  it('parses deep nesting', () => {
    const src = `%div\n  %ul\n    %li A\n    %li B\n  %footer`;
    const doc = parse(tokenize(src));
    const div = doc.children[0] as Element;
    const ul = div.children[0] as Element;
    expect(ul.children).toHaveLength(2);
    const footer = div.children[1] as Element;
    expect(footer.tag).toBe('footer');
  });

  it('parses if/else chain', () => {
    const src = `- if x\n  %span Yes\n- else\n  %span No`;
    const doc = parse(tokenize(src));
    const cf = doc.children[0] as ControlFlow;
    expect(cf.controlKind).toBe('if');
    expect(cf.next).toBeTruthy();
    expect(cf.next?.controlKind).toBe('else');
  });

  it('parses comment', () => {
    const doc = parse(tokenize('-# secret'));
    const comment = doc.children[0] as Comment;
    expect(comment.commentKind).toBe('haml');
    expect(comment.text).toBe('secret');
  });

  it('parses doctype', () => {
    const doc = parse(tokenize('!!! 5'));
    const dt = doc.children[0] as Doctype;
    expect(dt.value).toBe('5');
  });

  it('parses inline text after element', () => {
    const doc = parse(tokenize('%span Hello'));
    const el = doc.children[0] as Element;
    expect(el.children).toHaveLength(1);
    expect((el.children[0] as Text).value).toBe('Hello');
  });

  it('parses shorthand attributes', () => {
    const doc = parse(tokenize('%div{onClick}'));
    const el = doc.children[0] as Element;
    expect(el.attributes[0].shorthand).toBe(true);
    expect(el.attributes[0].name).toBe('onClick');
  });
});
