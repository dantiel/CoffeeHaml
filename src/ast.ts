import { SourceLocation } from './types.js';

// ─── Node Kinds ────────────────────────────────────────────

export type NodeKind =
  | 'Document'
  | 'Element'
  | 'ImplicitDiv'
  | 'Text'
  | 'Output'
  | 'ControlFlow'
  | 'Comment'
  | 'Filter'
  | 'Doctype';

export type ControlFlowKind = 'if' | 'unless' | 'for' | 'while' | 'else' | 'statement';
export type CommentKind = 'haml' | 'html';
export type OutputKind = 'escaped' | 'unescaped';

// ─── Base Node ─────────────────────────────────────────────

export abstract class Node {
  abstract readonly kind: NodeKind;
  readonly location?: SourceLocation;

  constructor(location?: SourceLocation) {
    this.location = location;
  }
}

// ─── Expression ────────────────────────────────────────────

/** Wraps a CoffeeScript expression — stores the raw source string.
 *  Parsed later by the CoffeeScript compiler. */
export class Expression {
  readonly source: string;
  /** Optional: the parsed CoffeeScript AST node (populated by expression phase). */
  parsed?: any;

  constructor(source: string, parsed?: any) {
    this.source = source;
    this.parsed = parsed;
  }

  toString(): string {
    return this.source;
  }
}

// ─── Document ──────────────────────────────────────────────

export class Document extends Node {
  readonly kind = 'Document' as const;
  readonly prologue: string[];   // raw JS lines before first HAML construct
  readonly children: Node[];

  constructor(children: Node[], prologue: string[] = [], location?: SourceLocation) {
    super(location);
    this.prologue = prologue;
    this.children = children;
  }
}

// ─── Element ───────────────────────────────────────────────

export class Element extends Node {
  readonly kind = 'Element' as const;
  readonly tag: string | Expression;   // 'div', 'MyComponent', or Expression
  readonly classes: string[];           // from .class modifiers
  readonly id: string | null;           // from #id modifier
  readonly attributes: AnyAttribute[];  // from {}/() blocks
  readonly children: Node[];            // nested child nodes
  readonly isComponent: boolean;        // true if tag starts uppercase
  readonly isSelfClosing: boolean;      // void elements or %.../
  /** Original attribute syntax: braces, parens, or bare. Null if no attributes. */
  readonly attrStyle: 'braces' | 'parens' | 'bare' | null;

  constructor(
    tag: string | Expression,
    opts: {
      classes?: string[];
      id?: string | null;
      attributes?: AnyAttribute[];
      children?: Node[];
      isComponent?: boolean;
      isSelfClosing?: boolean;
      attrStyle?: 'braces' | 'parens' | 'bare' | null;
      location?: SourceLocation;
    } = {}
  ) {
    super(opts.location);
    this.tag = tag;
    this.classes = opts.classes ?? [];
    this.id = opts.id ?? null;
    this.attributes = opts.attributes ?? [];
    this.children = opts.children ?? [];
    this.isComponent = opts.isComponent ?? false;
    this.isSelfClosing = opts.isSelfClosing ?? false;
    this.attrStyle = opts.attrStyle ?? null;
  }
}

/** A static attribute on an element — key is a string, value is an expression. */
export interface Attribute {
  spread?: undefined;
  name: string;
  value: Expression;
  shorthand: boolean; // true if {foo} shorthand → foo={foo}
}

/** A spread attribute: {props...} or {...props} → {...props} in JSX. */
export interface SpreadAttribute {
  spread: true;
  expression: Expression;
}

export type AnyAttribute = Attribute | SpreadAttribute;

// ─── ImplicitDiv ───────────────────────────────────────────

/** A div created by `.class` or `#id` without an explicit `%tag`. */
export class ImplicitDiv extends Node {
  readonly kind = 'ImplicitDiv' as const;
  readonly classes: string[];
  readonly id: string | null;
  readonly attributes: AnyAttribute[];
  readonly children: Node[];
  /** Original attribute syntax: braces, parens, or bare. Null if no attributes. */
  readonly attrStyle: 'braces' | 'parens' | 'bare' | null;

  constructor(
    opts: {
      classes?: string[];
      id?: string | null;
      attributes?: AnyAttribute[];
      children?: Node[];
      attrStyle?: 'braces' | 'parens' | 'bare' | null;
      location?: SourceLocation;
    } = {}
  ) {
    super(opts.location);
    this.classes = opts.classes ?? [];
    this.id = opts.id ?? null;
    this.attributes = opts.attributes ?? [];
    this.children = opts.children ?? [];
    this.attrStyle = opts.attrStyle ?? null;
  }
}

// ─── Text ──────────────────────────────────────────────────

export class Text extends Node {
  readonly kind = 'Text' as const;
  readonly value: string;

  constructor(value: string, location?: SourceLocation) {
    super(location);
    this.value = value;
  }
}

// ─── Output ────────────────────────────────────────────────

export class Output extends Node {
  readonly kind = 'Output' as const;
  readonly expression: Expression;
  readonly outputKind: OutputKind;
  /** Indented continuation children (TEXT = code continuation, others = nested elements). */
  readonly children: Node[];

  constructor(expression: Expression, outputKind: OutputKind, location?: SourceLocation, children: Node[] = []) {
    super(location);
    this.expression = expression;
    this.outputKind = outputKind;
    this.children = children;
  }
}

// ─── ControlFlow ───────────────────────────────────────────

export class ControlFlow extends Node {
  readonly kind = 'ControlFlow' as const;
  readonly controlKind: ControlFlowKind;
  readonly expression: Expression; // the if-condition, for-iterable, etc.
  readonly children: Node[];       // body nodes
  readonly next: ControlFlow | null; // chained else/elif

  constructor(
    controlKind: ControlFlowKind,
    expression: Expression,
    children: Node[] = [],
    next: ControlFlow | null = null,
    location?: SourceLocation
  ) {
    super(location);
    this.controlKind = controlKind;
    this.expression = expression;
    this.children = children;
    this.next = next;
  }

  /** Returns true if this is a for/while loop. */
  get isLoop(): boolean {
    return this.controlKind === 'for' || this.controlKind === 'while';
  }

  /** Returns true if this is a conditional. */
  get isConditional(): boolean {
    return this.controlKind === 'if' || this.controlKind === 'unless';
  }

  /** The chain length including this node. */
  get chainLength(): number {
    let n: ControlFlow | null = this;
    let count = 0;
    while (n) { count++; n = n.next; }
    return count;
  }
}

// ─── Comment ───────────────────────────────────────────────

export class Comment extends Node {
  readonly kind = 'Comment' as const;
  readonly commentKind: CommentKind;
  readonly text: string;

  constructor(commentKind: CommentKind, text: string, location?: SourceLocation) {
    super(location);
    this.commentKind = commentKind;
    this.text = text;
  }
}

// ─── Filter ────────────────────────────────────────────────

export class Filter extends Node {
  readonly kind = 'Filter' as const;
  readonly filterName: string;
  readonly content: string;

  constructor(filterName: string, content: string, location?: SourceLocation) {
    super(location);
    this.filterName = filterName;
    this.content = content;
  }
}

// ─── Doctype ───────────────────────────────────────────────

export class Doctype extends Node {
  readonly kind = 'Doctype' as const;
  readonly value: string;

  constructor(value: string, location?: SourceLocation) {
    super(location);
    this.value = value;
  }
}