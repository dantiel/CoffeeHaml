import { describe, it, expect } from 'vitest';
import { compile } from '../src/compiler.js';

describe('Integration', () => {
  it('compiles a simple page', () => {
    const src = `%div.page
  %h1 Welcome
  %p.content
    Hello World`;

    const result = compile(src);
    expect(result.errors).toHaveLength(0);
    expect(result.code).toContain('jsx');
    expect(result.code).toContain('"div"');
    expect(result.code).toContain('"h1"');
    expect(result.code).toContain('"p"');
  });

  it('compiles component with props', () => {
    const src = `%SimulatorPanel{source: "gyro", width: "auto", height: 500}
  %ServoGraph{channel: servo.channel}`;

    const result = compile(src);
    expect(result.errors).toHaveLength(0);
    expect(result.code).toContain('SimulatorPanel');
    expect(result.code).toContain('ServoGraph');
    expect(result.code).toContain('source');
    expect(result.code).toContain('"gyro"');
  });

  it('compiles for loop with components', () => {
    const src = `- for servo in servos
  %ServoPanel{servo: servo}`;

    const result = compile(src);
    expect(result.errors).toHaveLength(0);
    expect(result.code).toContain('.map');
    expect(result.code).toContain('servos');
    expect(result.code).toContain('ServoPanel');
  });

  it('compiles conditional rendering', () => {
    const src = `- if loading
  %Spinner
- else
  %Content`;

    const result = compile(src);
    expect(result.errors).toHaveLength(0);
    expect(result.code).toContain('?');
    expect(result.code).toContain('Spinner');
    expect(result.code).toContain('Content');
  });

  it('compiles button with event handler', () => {
    const src = `%Button{onClick: save, disabled: !connected}
  Save`;

    const result = compile(src);
    expect(result.errors).toHaveLength(0);
    expect(result.code).toContain('Button');
    expect(result.code).toContain('onClick');
    expect(result.code).toContain('disabled');
    expect(result.code).toContain('"Save"');
  });

  it('compiles multiple root elements', () => {
    const src = `%Header
%Main
  %Content
%Footer`;

    const result = compile(src);
    expect(result.errors).toHaveLength(0);
    expect(result.code).toContain('Header');
    expect(result.code).toContain('Main');
    expect(result.code).toContain('Content');
    expect(result.code).toContain('Footer');
  });

  it('compiles implicit divs', () => {
    const src = `.wrapper
  #content
    .item A
    .item B`;

    const result = compile(src);
    expect(result.errors).toHaveLength(0);
    expect(result.code).toContain('"div"');
    expect(result.code).toContain('"wrapper"');
    expect(result.code).toContain('"content"');
    expect(result.code).toContain('"item"');
  });

  it('compiles text and output mixed', () => {
    const src = `%p
  Hello, = name
  = "!"`;

    // Note: output on its own line becomes a child
    const result = compile(src);
    expect(result.errors).toHaveLength(0);
    expect(result.code).toContain('"Hello,"');
  });

  it('handles deep nesting', () => {
    const src = `%div
  %nav
    %ul
      %li Home
      %li About
      %li Contact
  %main
    %article
      %h2 Title
      %p Content`;
    const result = compile(src);
    expect(result.errors).toHaveLength(0);
  });

  it('compiles doctype and html element', () => {
    const src = `!!!
%html
  %head
    %title CoffeeHaml
  %body
    %h1 Hello`;
    const result = compile(src);
    expect(result.errors).toHaveLength(0);
    expect(result.code).toContain('DOCTYPE');
    expect(result.code).toContain('"html"');
  });
});
