/**
 * CoffeeHaml Prettier Printer — AST to Prettier Doc IR.
 *
 * Uses Prettier's `print` callback for recursive descent via path.map.
 * Each formatting decision gated by options for independent deactivation.
 *
 * Note: uses `any` for Path types because the abstract Node base class
 * doesn't declare `children`, so Prettier's typed AstPath.map can't
 * resolve property access chains on our AST nodes.
 */

import type { Doc } from 'prettier';
import * as prettier from 'prettier';
import {
  Document, Element, ImplicitDiv, Text, Output, ControlFlow,
  Comment, Filter, Doctype, Node, Expression,
  Attribute, SpreadAttribute, AnyAttribute,
} from '../ast.js';

const { group, indent, hardline, join } = prettier.doc.builders;

// ─── Options ───────────────────────────────────────────────

export interface CoffeeHamlFormatOptions {
  tagCase: 'preserve' | 'lowercase';
  implicitDivExpansion: boolean;
  maxChainLength: number;
  inlineThreshold: number;
  voidElementStyle: 'self-closing' | 'explicit';
  attributeStyle: 'preserve' | 'braces' | 'parens' | 'bare';
  attributeMultilineThreshold: number;
  attributeSort: 'none' | 'alphabetical' | 'idiomatic';
  quoteStyle: 'preserve' | 'double' | 'single';
  coffeeScriptFormat: boolean;
  methodChainAlign: boolean;
  blankLineHandling: 'preserve' | 'collapse' | 'respect';
  trailingWhitespace: 'remove' | 'preserve';
  continuationStyle: 'preserve' | 'indent' | 'backslash';
  controlFlowInline: boolean;
  commentFormat: boolean;
  tabWidth: number;
  useTabs: boolean;
  printWidth: number;
}

type Path = any;
type PrintFn = (selector?: any, args?: unknown) => Doc;

// ─── Utilities ─────────────────────────────────────────────

function opts(p: Path): CoffeeHamlFormatOptions {
  return p.__opts || defaultOpts;
}

const defaultOpts: CoffeeHamlFormatOptions = {
  tagCase: 'preserve', implicitDivExpansion: false, maxChainLength: 4,
  inlineThreshold: -1, voidElementStyle: 'self-closing',
  attributeStyle: 'preserve', attributeMultilineThreshold: 1,
  attributeSort: 'none', quoteStyle: 'preserve',
  coffeeScriptFormat: true, methodChainAlign: true,
  blankLineHandling: 'preserve', trailingWhitespace: 'remove',
  continuationStyle: 'indent', controlFlowInline: false,
  commentFormat: false, tabWidth: 2, useTabs: false, printWidth: 80,
};

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function isVoidElement(tag: string): boolean { return VOID_ELEMENTS.has(tag.toLowerCase()); }

/** True if children is a single inline-able node (Text or Output). */
function isSingleInlineChild(children: Node[]): boolean {
  if (children.length !== 1) return false;
  const child = children[0];
  return child instanceof Text || child instanceof Output;
}

/** Format a single inline child as a Doc. */
function formatInlineChild(child: Node, o: CoffeeHamlFormatOptions): Doc {
  if (child instanceof Text) return child.value;
  if (child instanceof Output) {
    const prefix = child.outputKind === 'unescaped' ? '!= ' : '= ';
    return prefix + (o.coffeeScriptFormat
      ? formatCS(child.expression.source)
      : child.expression.source);
  }
  return '';
}

function normalizeTag(tag: string, o: CoffeeHamlFormatOptions): string {
  if (o.tagCase === 'lowercase' && tag[0] !== undefined && tag[0] === tag[0].toLowerCase()) {
    return tag.toLowerCase();
  }
  return tag;
}

function buildTagPrefix(tag: string | null, classes: string[], id: string | null, o: CoffeeHamlFormatOptions): string {
  const parts: string[] = [];
  if (tag) parts.push('%' + normalizeTag(tag, o));
  for (const c of classes) parts.push('.' + c);
  if (id) parts.push('#' + id);
  return parts.join('');
}

function formatAttr(attr: Attribute): string {
  return attr.shorthand ? attr.name : `${attr.name}: ${attr.value.toString()}`;
}

function sortAttrs(attrs: AnyAttribute[], o: CoffeeHamlFormatOptions): AnyAttribute[] {
  if (o.attributeSort === 'none') return attrs;
  const staticAttrs: Attribute[] = [];
  const spreadAttrs: SpreadAttribute[] = [];
  for (const a of attrs) {
    if ('spread' in a && a.spread) spreadAttrs.push(a);
    else staticAttrs.push(a as Attribute);
  }
  if (o.attributeSort === 'alphabetical') {
    staticAttrs.sort((a, b) => a.name.localeCompare(b.name));
  } else if (o.attributeSort === 'idiomatic') {
    staticAttrs.sort((a, b) => {
      if (a.name === 'id') return -1;
      if (b.name === 'id') return 1;
      if (a.name === 'class') return -1;
      if (b.name === 'class') return 1;
      return a.name.localeCompare(b.name);
    });
  }
  return [...staticAttrs, ...spreadAttrs];
}

// ─── Main dispatcher ───────────────────────────────────────

export function print(
  path: Path,
  options: CoffeeHamlFormatOptions,
  printFn: PrintFn,
): Doc {
  path.__opts = options;
  return printNode(path, printFn);
}

function printNode(path: Path, printFn: PrintFn): Doc {
  const node = path.getValue();
  if (!node || typeof node !== 'object') return '';

  switch ((node as any).kind) {
    case 'Document':    return printDoc(path, printFn);
    case 'Element':     return printEl(path, printFn);
    case 'ImplicitDiv': return printImplicit(path, printFn);
    case 'Text':        return (node as Text).value;
    case 'Output':      return printOut(path, printFn);
    case 'ControlFlow': return printFlow(path, printFn);
    case 'Comment':     return printComm(path);
    case 'Filter':      return printFilt(path);
    case 'Doctype':     return '!!! ' + (node as Doctype).value;
    default:            return '';
  }
}

// ─── Document ──────────────────────────────────────────────

function printDoc(path: Path, printFn: PrintFn): Doc {
  const doc = path.getValue() as Document;
  const docs: Doc[] = [];

  if (doc.prologue && doc.prologue.length > 0) {
    for (const line of doc.prologue) {
      docs.push(line);
      docs.push(hardline);
    }
    docs.push(hardline);
  }

  if (doc.children.length > 0) {
    docs.push(join(hardline, path.map(printFn, 'children')));
  }

  docs.push(hardline);
  return docs;
}

// ─── Element ───────────────────────────────────────────────

function printEl(path: Path, printFn: PrintFn): Doc {
  const node = path.getValue() as Element;
  const o = opts(path);

  const prefix = buildTagPrefix(
    node.tag instanceof Expression ? null : node.tag as string,
    node.classes, node.id, o,
  );

  const voidEl = !(node.tag instanceof Expression) && isVoidElement(node.tag as string);
  const selfClose = node.isSelfClosing || (voidEl && o.voidElementStyle === 'self-closing');
  const hasChildren = node.children.length > 0;

  const tagDoc: Doc = node.tag instanceof Expression ? '%' + node.tag.source : prefix;
  const attrsDoc = printAttrs(node.attributes, o);

  if (selfClose && !hasChildren) {
    return node.isSelfClosing ? group([tagDoc, attrsDoc, '/']) : group([tagDoc, attrsDoc]);
  }

  if (!hasChildren) {
    return group([tagDoc, attrsDoc]);
  }

  // Single inline child → keep inline
  if (isSingleInlineChild(node.children)) {
    return group([tagDoc, attrsDoc, ' ', formatInlineChild(node.children[0], o)]);
  }

  const childrenDoc = join(hardline, path.map(printFn, 'children'));
  return group([tagDoc, attrsDoc, indent([hardline, childrenDoc])]);
}

// ─── ImplicitDiv ───────────────────────────────────────────

function printImplicit(path: Path, printFn: PrintFn): Doc {
  const node = path.getValue() as ImplicitDiv;
  const o = opts(path);
  const prefix = buildTagPrefix(null, node.classes, node.id, o);

  if (node.classes.length > 1 && o.maxChainLength > 0 && node.classes.length >= o.maxChainLength) {
    return printChained(path, printFn);
  }

  const attrsDoc = printAttrs(node.attributes, o);
  if (node.children.length === 0) return group([prefix, attrsDoc]);

  // Single inline child → keep inline
  if (isSingleInlineChild(node.children)) {
    return group([prefix, attrsDoc, ' ', formatInlineChild(node.children[0], o)]);
  }

  const childrenDoc = join(hardline, path.map(printFn, 'children'));
  return group([prefix, attrsDoc, indent([hardline, childrenDoc])]);
}

function printChained(path: Path, printFn: PrintFn): Doc {
  const node = path.getValue() as ImplicitDiv;
  const o = opts(path);
  const docs: Doc[] = [];

  for (let i = 0; i < node.classes.length; i++) {
    if (i > 0) docs.push(hardline);
    const cls = node.classes[i];
    const isLast = i === node.classes.length - 1;
    const idPart = (isLast && node.id) ? '#' + node.id : '';
    docs.push('.' + cls + idPart);
    if (isLast) {
      docs.push(printAttrs(node.attributes, o));
      if (node.children.length > 0) {
        docs.push(indent([hardline, join(hardline, path.map(printFn, 'children'))]));
      }
    }
  }
  return group(docs);
}

// ─── Output ────────────────────────────────────────────────

function printOut(path: Path, printFn: PrintFn): Doc {
  const node = path.getValue() as Output;
  const o = opts(path);
  const prefix = node.outputKind === 'unescaped' ? '!= ' : '= ';
  const exprDoc: Doc = o.coffeeScriptFormat
    ? formatCS(node.expression.source)
    : node.expression.source;

  if (node.children.length === 0) return group([prefix, exprDoc]);

  const childrenDoc = join(hardline, path.map(printFn, 'children'));
  return group([prefix, exprDoc, indent([hardline, childrenDoc])]);
}

// ─── ControlFlow ───────────────────────────────────────────

function printFlow(path: Path, printFn: PrintFn): Doc {
  const node = path.getValue() as ControlFlow;
  const o = opts(path);

  const keyword = node.controlKind;
  const exprDoc: Doc = o.coffeeScriptFormat
    ? formatCS(node.expression.source)
    : node.expression.source;

  const hasChildren = node.children.length > 0;
  const hasNext = node.next !== null;

  if (o.controlFlowInline && hasChildren && !hasNext) {
    const onlyChild = node.children[0];
    if (onlyChild instanceof Text && !node.expression.source.includes('\n')) {
      return group(['- ', keyword, ' ', exprDoc, ' then ', onlyChild.value]);
    }
  }

  const header: Doc[] = ['- ', keyword];
  if (node.expression.source) { header.push(' '); header.push(exprDoc); }

  const docs: Doc[] = [group(header)];
  if (hasChildren) {
    docs.push(indent([hardline, join(hardline, path.map(printFn, 'children'))]));
  }
  if (hasNext) {
    docs.push(printNextFlow(node.next, o, printFn));
  }
  return group(docs);
}

function printNextFlow(next: ControlFlow, o: CoffeeHamlFormatOptions, printFn: PrintFn): Doc {
  const keyword = next.controlKind;
  const exprDoc: Doc = o.coffeeScriptFormat
    ? formatCS(next.expression.source)
    : next.expression.source;

  const header: Doc[] = [hardline, '- ', keyword];
  if (next.expression.source) { header.push(' '); header.push(exprDoc); }

  const docs: Doc[] = [group(header)];
  if (next.children.length > 0) {
    docs.push(indent([hardline, printChildrenDirect(next.children, o, printFn)]));
  }
  if (next.next) {
    docs.push(printNextFlow(next.next, o, printFn));
  }
  return group(docs);
}

function printChildrenDirect(children: Node[], o: CoffeeHamlFormatOptions, printFn: PrintFn): Doc {
  const docs: Doc[] = [];
  for (let i = 0; i < children.length; i++) {
    if (i > 0) docs.push(hardline);
    docs.push(nodeToDoc(children[i], o, printFn));
  }
  return docs;
}

function nodeToDoc(node: Node, o: CoffeeHamlFormatOptions, printFn: PrintFn): Doc {
  if (node instanceof Text) return node.value;
  if (node instanceof Element) {
    const prefix = buildTagPrefix(
      node.tag instanceof Expression ? null : node.tag as string,
      node.classes, node.id, o,
    );
    const attrsDoc = printAttrs(node.attributes, o);
    if (isSingleInlineChild(node.children)) {
      return group([prefix, attrsDoc, ' ', formatInlineChild(node.children[0], o)]);
    }
    const childrenDoc = node.children.length > 0
      ? indent([hardline, printChildrenDirect(node.children, o, printFn)])
      : '';
    return group([prefix, attrsDoc, childrenDoc]);
  }
  if (node instanceof ImplicitDiv) {
    const prefix = buildTagPrefix(null, node.classes, node.id, o);
    const attrsDoc = printAttrs(node.attributes, o);
    if (isSingleInlineChild(node.children)) {
      return group([prefix, attrsDoc, ' ', formatInlineChild(node.children[0], o)]);
    }
    const childrenDoc = node.children.length > 0
      ? indent([hardline, printChildrenDirect(node.children, o, printFn)])
      : '';
    return group([prefix, attrsDoc, childrenDoc]);
  }
  if (node instanceof Output) {
    const prefix = node.outputKind === 'unescaped' ? '!= ' : '= ';
    const exprDoc = o.coffeeScriptFormat
      ? formatCS(node.expression.source)
      : node.expression.source;
    const childrenDoc = node.children.length > 0
      ? indent([hardline, printChildrenDirect(node.children, o, printFn)])
      : '';
    return group([prefix, exprDoc, childrenDoc]);
  }
  if (node instanceof ControlFlow) {
    const keyword = node.controlKind;
    const exprDoc = o.coffeeScriptFormat
      ? formatCS(node.expression.source)
      : node.expression.source;
    const header: Doc[] = ['- ', keyword];
    if (node.expression.source) { header.push(' '); header.push(exprDoc); }
    const childrenDoc = node.children.length > 0
      ? indent([hardline, printChildrenDirect(node.children, o, printFn)])
      : '';
    return group([...header, childrenDoc]);
  }
  return '';
}

// ─── Comment / Filter ──────────────────────────────────────

function printComm(path: Path): Doc {
  const node = path.getValue() as Comment;
  return node.commentKind === 'html' ? '/ ' + node.text : '-# ' + node.text;
}

function printFilt(path: Path): Doc {
  const node = path.getValue() as Filter;
  const lines = node.content.split('\n');
  const bodyDocs: Doc[] = [];
  for (const l of lines) {
    bodyDocs.push(hardline);
    bodyDocs.push('  ' + l);
  }
  if (bodyDocs.length > 0) return [':' + node.filterName, ...bodyDocs];
  return ':' + node.filterName;
}

// ─── Attributes ────────────────────────────────────────────

function printAttrs(attrs: AnyAttribute[], o: CoffeeHamlFormatOptions): Doc {
  if (attrs.length === 0) return '';

  const sorted = sortAttrs([...attrs], o);
  const style = detectStyle(o);

  if (style === 'bare') return printBare(sorted, o);

  const open = style === 'braces' ? '{' : '(';
  const close = style === 'braces' ? '}' : ')';

  if (sorted.length <= 1) {
    const parts: Doc[] = [open];
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0) parts.push(', ');
      parts.push(anyAttr(sorted[i]));
    }
    parts.push(close);
    return group(parts);
  }

  return group([
    open,
    indent([hardline, join([',', hardline], sorted.map(a => anyAttr(a)))]),
    hardline,
    close,
  ]);
}

function anyAttr(attr: AnyAttribute): Doc {
  if ('spread' in attr && attr.spread) return '...' + attr.expression.source;
  return formatAttr(attr);
}

function detectStyle(o: CoffeeHamlFormatOptions): 'braces' | 'parens' | 'bare' {
  if (o.attributeStyle === 'preserve') return 'braces';
  if (o.attributeStyle === 'parens') return 'parens';
  if (o.attributeStyle === 'bare') return 'bare';
  return 'braces';
}

function printBare(attrs: AnyAttribute[], o: CoffeeHamlFormatOptions): Doc {
  const parts: Doc[] = [];
  for (let i = 0; i < attrs.length; i++) {
    if (i > 0) parts.push(' ');
    const attr = attrs[i];
    if ('spread' in attr && attr.spread) {
      parts.push('...' + attr.expression.source);
    } else {
      const q = o.quoteStyle === 'single' ? "'" : '"';
      parts.push(attr.name + '=' + q + attr.value.toString() + q);
    }
  }
  return group(parts);
}

// ─── CoffeeScript delegation (stub, Phase 4) ──────────────

function formatCS(source: string): Doc {
  return source;
}