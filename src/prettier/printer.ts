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
import { formatCoffeeScript, formatCoffeeScriptBlock } from './coffeescript-formatter.js';

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
  statementMerging: 'preserve' | 'merge';
  commentFormat: boolean;
  tabWidth: number;
  useTabs: boolean;
  printWidth: number;
  originalText?: string;
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
  statementMerging: 'preserve', commentFormat: false,
  tabWidth: 2, useTabs: false, printWidth: 80,
  originalText: undefined,
};

/** Internal wrapper: merged consecutive childless statement nodes (formatting only). */
class MergedStatements {
  kind = 'MergedStatements';
  statements: ControlFlow[];
  constructor(stmts: ControlFlow[]) { this.statements = stmts; }
}

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

/** Join children docs with blank-line-aware spacing. */
function joinChildrenWithBlanks(
  nodes: Node[],
  docs: Doc[],
  o: CoffeeHamlFormatOptions,
): Doc {
  if (docs.length === 0) return '';
  if (docs.length === 1) return docs[0];
  const result: Doc[] = [];
  for (let i = 0; i < docs.length; i++) {
    if (i > 0) {
      const node = nodes[i] as any;
      const hasBlank = o.blankLineHandling === 'preserve' && node._blankBefore;
      result.push(hasBlank ? [hardline, hardline] : hardline);
    }
    result.push(docs[i]);
  }
  return result;
}

/** Format a single inline child as a Doc. */
function formatInlineChild(child: Node, o: CoffeeHamlFormatOptions): Doc {
  if (child instanceof Text) return child.value;
  if (child instanceof Output) {
    const prefix = child.outputKind === 'unescaped' ? '!= ' : '= ';
    return prefix + (o.coffeeScriptFormat
      ? formatCS(child.expression.source, o)
      : child.expression.source);
  }
  return '';
}

function normalizeTag(tag: string, o: CoffeeHamlFormatOptions): string {
  if (o.tagCase === 'lowercase') {
    // Distinguish HTML tags from React components:
    // - PascalCase (e.g., MyComponent) → component, preserve case
    // - all-uppercase (e.g., DIV) → HTML tag, lowercase
    // - all-lowercase (e.g., div) → HTML tag, lowercase
    const isPascal = /^[A-Z][a-z]/.test(tag); // starts with uppercase followed by lowercase
    if (!isPascal) {
      return tag.toLowerCase();
    }
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
  if (options.statementMerging === 'merge') {
    mergeAllStatements(path.getValue(), options);
  }
  if (options.blankLineHandling === 'preserve' && options.originalText) {
    markBlankLines(path.getValue(), options.originalText);
  }
  return printNode(path, printFn);
}

/** Pre-pass: mark sibling nodes that had blank lines before them in source. */
function markBlankLines(node: any, source: string): void {
  if (!node || !node.children || !Array.isArray(node.children)) return;
  const children = node.children;
  for (let i = 1; i < children.length; i++) {
    const prev = children[i - 1];
    const curr = children[i];
    const prevEnd = prev?.location?.offset + prev?.location?.length;
    const currStart = curr?.location?.offset;
    if (prevEnd != null && currStart != null && prevEnd < currStart) {
      const between = source.slice(prevEnd, currStart);
      // Two consecutive newlines (or more) = blank line
      if (/\n\s*\n/.test(between)) {
        (curr as any)._blankBefore = true;
      }
    }
  }
  // Recurse
  for (const child of children) {
    if (!(child instanceof MergedStatements)) {
      markBlankLines(child, source);
    }
  }
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
    case 'ControlFlow':     return printFlow(path, printFn);
    case 'MergedStatements': return printMergedFlow(path, printFn);
    case 'Comment':         return printComm(path);
    case 'Filter':      return printFilt(path);
    case 'Doctype':     return '!!! ' + (node as Doctype).value;
    default:            return '';
  }
}

// ─── Document ──────────────────────────────────────────────

function printDoc(path: Path, printFn: PrintFn): Doc {
  const doc = path.getValue() as Document;
  const o = opts(path);
  const docs: Doc[] = [];

  if (doc.prologue && doc.prologue.length > 0) {
    for (const line of doc.prologue) {
      docs.push(line);
      docs.push(hardline);
    }
    docs.push(hardline);
  }

  if (doc.children.length > 0) {
    const childDocs = path.map(printFn, 'children') as Doc[];
    docs.push(joinChildrenWithBlanks(doc.children, childDocs, o));
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
  const hasChildren = node.children.length > 0;

  // Determine self-closing behavior
  const shouldSelfClose = node.isSelfClosing ||
    (voidEl && o.voidElementStyle === 'self-closing' && !hasChildren);
  // explicit style: only self-close if author wrote %tag/
  const showSlash = node.isSelfClosing ||
    (voidEl && o.voidElementStyle === 'self-closing' && !hasChildren);

  const tagDoc: Doc = node.tag instanceof Expression ? '%' + node.tag.source : prefix;
  const attrsDoc = printAttrs(node.attributes, o, node);

  if (shouldSelfClose && !hasChildren) {
    return showSlash ? group([tagDoc, attrsDoc, '/']) : group([tagDoc, attrsDoc]);
  }

  if (!hasChildren) {
    return group([tagDoc, attrsDoc]);
  }

  // Single inline child → keep inline
  if (isSingleInlineChild(node.children)) {
    const child = node.children[0];
    const inlineDoc = formatInlineChild(child, o);
    // Output (= expr) already has its own separator; Text needs a space
    const sep = child instanceof Output ? '' : ' ';
    return group([tagDoc, attrsDoc, sep, inlineDoc]);
  }

  const childDocs = path.map(printFn, 'children') as Doc[];
  const childrenDoc = joinChildrenWithBlanks(node.children, childDocs, o);
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

  const attrsDoc = printAttrs(node.attributes, o, node);
  if (node.children.length === 0) return group([prefix, attrsDoc]);

  // Single inline child → keep inline
  if (isSingleInlineChild(node.children)) {
    return group([prefix, attrsDoc, ' ', formatInlineChild(node.children[0], o)]);
  }

  const childDocs = path.map(printFn, 'children') as Doc[];
  const childrenDoc = joinChildrenWithBlanks(node.children, childDocs, o);
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
      docs.push(printAttrs(node.attributes, o, node));
      if (node.children.length > 0) {
        const childDocs = path.map(printFn, 'children') as Doc[];
        docs.push(indent([hardline, joinChildrenWithBlanks(node.children, childDocs, o)]));
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
    ? formatCS(node.expression.source, o)
    : node.expression.source;

  if (node.children.length === 0) return group([prefix, exprDoc]);

  const childDocs = path.map(printFn, 'children') as Doc[];
  const childrenDoc = joinChildrenWithBlanks(node.children, childDocs, o);
  return group([prefix, exprDoc, indent([hardline, childrenDoc])]);
}

// ─── ControlFlow ───────────────────────────────────────────

function printFlow(path: Path, printFn: PrintFn): Doc {
  const node = path.getValue() as ControlFlow;
  const o = opts(path);

  const keyword = node.controlKind;
  const exprDoc: Doc = o.coffeeScriptFormat
    ? formatCS(node.expression.source, o)
    : node.expression.source;

  const hasChildren = node.children.length > 0;
  const hasNext = node.next !== null;

  // Inline control flow: - if x then .ok   or   - if x then %span hello
  if (o.controlFlowInline && hasChildren && !hasNext) {
    const exprHasNewlines = node.expression.source.includes('\n');
    // Only if/unless support CoffeeScript's "then" keyword
    const useThen = node.isConditional;
    if (!exprHasNewlines && node.children.length === 1) {
      const onlyChild = node.children[0];
      // Text child: - if x then "hello"
      if (onlyChild instanceof Text) {
        const thenPart = useThen ? ' then ' : ' ';
        return group(['- ', keyword, ' ', exprDoc, thenPart, onlyChild.value]);
      }
      // Element child: - if x then %span hello
      if (onlyChild instanceof Element || onlyChild instanceof ImplicitDiv) {
        const thenPart = useThen ? ' then ' : ' ';
        const childDoc = nodeToDoc(onlyChild, o, printFn);
        return group(['- ', keyword, ' ', exprDoc, thenPart, childDoc]);
      }
    }
  }

  const header: Doc[] = keyword === 'statement' ? ['-'] : ['- ', keyword];
  if (node.expression.source) { header.push(' '); header.push(exprDoc); }

  const docs: Doc[] = [group(header)];
  if (hasChildren) {
    const childDocs = path.map(printFn, 'children') as Doc[];
    docs.push(indent([hardline, joinChildrenWithBlanks(node.children, childDocs, o)]));
  }
  if (hasNext) {
    docs.push(printNextFlow(node.next, o, printFn));
  }
  return group(docs);
}

function printNextFlow(next: ControlFlow, o: CoffeeHamlFormatOptions, printFn: PrintFn): Doc {
  const keyword = next.controlKind;
  const exprDoc: Doc = o.coffeeScriptFormat
    ? formatCS(next.expression.source, o)
    : next.expression.source;

  const header: Doc[] = keyword === 'statement'
    ? [hardline, '-']
    : [hardline, '- ', keyword];
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

// ─── Merged Statements (pre-pass) ──────────────────────────

function mergeAllStatements(node: any, o: CoffeeHamlFormatOptions): void {
  if (!node || !node.children || !Array.isArray(node.children)) return;
  node.children = mergeConsecutiveStatements(node.children, o);
  for (const child of node.children) {
    if (!(child instanceof MergedStatements)) {
      mergeAllStatements(child, o);
    }
  }
}

function mergeConsecutiveStatements(children: Node[], o: CoffeeHamlFormatOptions): Node[] {
  if (o.statementMerging !== 'merge') return children;

  const result: Node[] = [];
  let stmtGroup: ControlFlow[] = [];

  for (const child of children) {
    if (child instanceof ControlFlow &&
        child.controlKind === 'statement' &&
        child.children.length === 0 &&
        !child.next) {
      stmtGroup.push(child);
    } else {
      flushGroup();
      result.push(child);
    }
  }
  flushGroup();
  return result;

  function flushGroup() {
    if (stmtGroup.length > 1) {
      result.push(new MergedStatements(stmtGroup) as unknown as Node);
    } else if (stmtGroup.length === 1) {
      result.push(stmtGroup[0]);
    }
    stmtGroup = [];
  }
}

function printMergedFlow(path: Path, _printFn: PrintFn): Doc {
  const merged = path.getValue() as MergedStatements;
  const o = opts(path);
  const docs: Doc[] = ['-'];

  for (const stmt of merged.statements) {
    const exprDoc: Doc = o.coffeeScriptFormat
      ? formatCS(stmt.expression.source, o)
      : stmt.expression.source;
    docs.push(indent([hardline, exprDoc]));
  }

  return group(docs);
}

function printChildrenDirect(children: Node[], o: CoffeeHamlFormatOptions, printFn: PrintFn): Doc {
  const docs: Doc[] = [];
  for (let i = 0; i < children.length; i++) {
    if (i > 0) {
      const node = children[i] as any;
      const hasBlank = o.blankLineHandling === 'preserve' && node._blankBefore;
      docs.push(hasBlank ? [hardline, hardline] : hardline);
    }
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
    const attrsDoc = printAttrs(node.attributes, o, node);
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
    const attrsDoc = printAttrs(node.attributes, o, node);
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
  const o = opts(path);
  let text = node.text;

  // Reflow long comment text to printWidth
  if (o.commentFormat && text.length > o.printWidth - 3) {
    text = reflowComment(text, o.printWidth - 3, 2);
  }

  return node.commentKind === 'html' ? '/ ' + text : '-# ' + text;
}

/** Simple word-wrap for comment text. Preserves existing newlines. */
function reflowComment(text: string, maxWidth: number, _indent: number): string {
  const paragraphs = text.split('\n');
  const result: string[] = [];

  for (const para of paragraphs) {
    if (para.length <= maxWidth) {
      result.push(para);
      continue;
    }
    const words = para.split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? current + ' ' + word : word;
      if (candidate.length <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    result.push(lines.join('\n'));
  }

  return result.join('\n');
}

function printFilt(path: Path): Doc {
  const node = path.getValue() as Filter;
  const lines = node.content.split('\n');
  const bodyDocs: Doc[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    // Skip leading empty line (from content starting with \n)
    if (i === 0 && l === '') continue;
    bodyDocs.push(hardline);
    bodyDocs.push('  ' + l);
  }
  if (bodyDocs.length > 0) return [':' + node.filterName, ...bodyDocs];
  return ':' + node.filterName;
}

// ─── Attributes ────────────────────────────────────────────

function printAttrs(attrs: AnyAttribute[], o: CoffeeHamlFormatOptions, element?: Element | ImplicitDiv): Doc {
  if (attrs.length === 0) return '';

  const sorted = sortAttrs([...attrs], o);
  const style = detectStyle(o, element);

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

function detectStyle(o: CoffeeHamlFormatOptions, element?: Element | ImplicitDiv): 'braces' | 'parens' | 'bare' {
  // When preserving, respect the original syntax from the AST
  if (o.attributeStyle === 'preserve') {
    if (element?.attrStyle) return element.attrStyle;
    // Fallback: if element has attributes but no recorded style, assume braces
    if (element?.attributes && element.attributes.length > 0) return 'braces';
    return 'braces'; // default for elements with attributes
  }
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

// ─── CoffeeScript delegation (Phase 4) ────────────────────

/**
 * Format a CoffeeScript expression string.
 * Uses CoffeeScript's token-based formatter.
 * Returns a Doc (string) that Prettier can embed.
 */
function formatCS(source: string, o?: CoffeeHamlFormatOptions): Doc {
  const pw = o?.printWidth ?? 80;
  const mc = o?.methodChainAlign ?? true;
  const enabled = o?.coffeeScriptFormat ?? true;

  return formatCoffeeScript(source, {
    printWidth: pw,
    methodChainAlign: mc,
    enabled,
  });
}

/**
 * Prettier embed function — formats full CoffeeScript blocks
 * (Statement bodies, CoffeeScript filters) via the async textToDoc
 * mechanism. Inline expressions are handled synchronously via formatCS.
 */
export function embedCoffeeScript(
  path: any,
  _printFn: any,
): Doc | undefined {
  const node = path.getValue();
  const o = path.__opts as CoffeeHamlFormatOptions | undefined;

  // Statement children — when a - block has indented code continuation
  // (these are Text nodes whose parent is a ControlFlow with controlKind === 'statement')
  // We detect them by checking if this is a Text node inside a ControlFlow 'statement'
  if (node instanceof Text) {
    const parent = path.getParent?.() as ControlFlow | undefined;
    if (parent instanceof ControlFlow && parent.controlKind === 'statement') {
      const formatted = formatCoffeeScriptBlock(node.value, {
        printWidth: o?.printWidth ?? 80,
        methodChainAlign: o?.methodChainAlign ?? true,
        enabled: o?.coffeeScriptFormat ?? true,
      });
      return formatted;
    }
  }

  // CoffeeScript filter: format the body, preserve the :coffeescript label
  if (node instanceof Filter && node.filterName.toLowerCase() === 'coffeescript') {
    const formatted = formatCoffeeScriptBlock(node.content, {
      printWidth: o?.printWidth ?? 80,
      methodChainAlign: o?.methodChainAlign ?? true,
      enabled: o?.coffeeScriptFormat ?? true,
    });
    // Return full filter with label and indented body
    const lines = formatted.split('\n');
    const bodyDocs: Doc[] = [':' + node.filterName];
    for (const l of lines) {
      bodyDocs.push(hardline);
      bodyDocs.push('  ' + l);
    }
    return bodyDocs;
  }

  return undefined;
}