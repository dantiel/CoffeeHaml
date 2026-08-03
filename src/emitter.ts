import {
  Document, Element, ImplicitDiv, Text, Output, ControlFlow,
  Comment, Filter, Doctype, Node, Expression,
} from './ast.js';
import { compileExpression } from './expressions.js';
import { EmitterOptions, EmitResult } from './types.js';

// ─── Emit State ────────────────────────────────────────────

class EmitState {
  indent: number = 0;
  output: string = '';
  needsFragment: boolean = false;
  needsImport: boolean = false;
  options: EmitterOptions;
  sourceMapLines: string[] = [];

  constructor(options: EmitterOptions = {}) {
    this.options = options;
  }

  emit(s: string): void {
    if (s) {
      this.output += ' '.repeat(this.indent * 2) + s;
    }
  }

  emitLine(s: string = ''): void {
    if (s) {
      this.output += ' '.repeat(this.indent * 2) + s;
    }
    this.output += '\n';
  }

  indentBlock(fn: () => void): void {
    this.indent++;
    fn();
    this.indent--;
  }
}

// ─── Public API ────────────────────────────────────────────

export function emit(ast: Document, options: EmitterOptions = {}): EmitResult {
  const state = new EmitState(options);

  // Emit import if needed
  state.emitLine(`import { jsx, jsxs, Fragment } from "${options.jsxRuntime || 'react/jsx-runtime'}";`);
  state.emitLine();

  // Emit module body
  emitNodes(ast.children, state, true);

  return { code: state.output };
}

// ─── Node Emitters ─────────────────────────────────────────

function emitNodes(nodes: Node[], state: EmitState, isRoot: boolean = false): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (node instanceof ControlFlow) {
      // Control flow wraps subsequent siblings
      const remaining = nodes.slice(i + 1);
      emitControlFlow(node, remaining, state, isRoot);
      return; // control flow consumes remaining nodes
    }

    emitNode(node, state, isRoot);
  }
}

function emitNode(node: Node, state: EmitState, isRoot: boolean): void {
  if (node instanceof Element) emitElement(node, state);
  else if (node instanceof ImplicitDiv) emitImplicitDiv(node, state);
  else if (node instanceof Text) emitText(node, state);
  else if (node instanceof Output) emitOutput(node, state);
  else if (node instanceof ControlFlow) emitControlFlow(node, [], state, isRoot);
  else if (node instanceof Comment) emitComment(node, state);
  else if (node instanceof Filter) emitFilter(node, state);
  else if (node instanceof Doctype) emitDoctype(node, state);
}

// ─── Element ───────────────────────────────────────────────

function emitElement(el: Element, state: EmitState): void {
  const hasChildren = el.children.length > 0;
  const fn = hasChildren ? 'jsxs' : 'jsx';

  // Tag
  const tagJs = tagToJs(el);

  // Attributes
  const attrs = buildAttributes(el);
  const attrsJs = attrs.length > 0 ? `{ ${attrs.join(', ')} }` : 'null';

  // Children
  if (hasChildren) {
    state.emit(`${fn}(${tagJs}, ${attrsJs}`);
    if (el.children.length === 1) {
      // Single child — inline
      const childJs = emitChildToJs(el.children[0], state);
      state.output += `, ${childJs});\n`;
    } else {
      // Multiple children
      state.output += ',\n';
      state.indentBlock(() => {
        for (let i = 0; i < el.children.length; i++) {
          const childJs = emitChildToJs(el.children[i], state);
          const comma = i < el.children.length - 1 ? ',' : '';
          state.emitLine(`${childJs}${comma}`);
        }
      });
      state.emitLine(');');
    }
  } else {
    state.emitLine(`${fn}(${tagJs}, ${attrsJs});`);
  }
}

function tagToJs(el: Element): string {
  if (el.tag instanceof Expression) {
    return compileExpression(el.tag);
  }
  if (el.isComponent) {
    return el.tag;
  }
  return `"${el.tag}"`;
}

function buildAttributes(el: Element): string[] {
  const parts: string[] = [];

  // id
  if (el.id) {
    parts.push(`id: "${el.id}"`);
  }

  // class from .class modifiers
  let classNames: string[] = [...el.classes];

  // Named attributes
  for (const attr of el.attributes) {
    const valJs = compileExpression(attr.value);
    const name = attrNameToJs(attr.name);

    if (name === 'className' || name === 'class') {
      // Collect class names from className/class attribute
      if (attr.shorthand) {
        classNames.push(`\${${valJs}}`);
      } else {
        classNames.push(valJs.replace(/^['"]|['"]$/g, ''));
      }
    } else if (attr.shorthand) {
      parts.push(`${name}: ${valJs}`);
    } else {
      parts.push(`${name}: ${valJs}`);
    }
  }

  // Emit className
  if (classNames.length > 0) {
    const unique = [...new Set(classNames)];
    if (unique.length === 1 && !unique[0].includes('${')) {
      parts.push(`className: "${unique[0]}"`);
    } else {
      const joined = unique.map(c => c.includes('${') ? c : `"${c}"`).join(' + " " + ');
      parts.push(`className: ${joined}`);
    }
  }

  // style as object
  const styleAttr = el.attributes.find(a => attrNameToJs(a.name) === 'style');
  if (styleAttr && !styleAttr.shorthand) {
    // Already handled above — but ensure it's an object expression
  }

  return parts;
}

function attrNameToJs(name: string): string {
  // class → className for React
  if (name === 'class') return 'className';
  // for → htmlFor for React
  if (name === 'for') return 'htmlFor';
  // data-* attributes keep their name
  if (name.includes('-')) {
    // Convert to camelCase quoted: 'data-value' → "data-value"
    return `"${name}"`;
  }
  return name;
}

function emitImplicitDiv(div: ImplicitDiv, state: EmitState): void {
  const el = new Element('div', {
    classes: div.classes,
    id: div.id,
    attributes: div.attributes,
    children: div.children,
    isComponent: false,
    isSelfClosing: false,
    location: div.location,
  });
  emitElement(el, state);
}

// ─── Child Emission ────────────────────────────────────────

function emitChildToJs(node: Node, state: EmitState): string {
  if (node instanceof Text) {
    return escapeString(node.value);
  }
  if (node instanceof Output) {
    return compileExpression(node.expression);
  }
  if (node instanceof Element) {
    const hasChildren = node.children.length > 0;
    const fn = hasChildren ? 'jsxs' : 'jsx';
    const tagJs = tagToJs(node);
    const attrs = buildAttributes(node);
    const attrsJs = attrs.length > 0 ? `{ ${attrs.join(', ')} }` : 'null';

    if (hasChildren) {
      const childParts = node.children.map(c => emitChildToJs(c, state));
      return `${fn}(${tagJs}, ${attrsJs}, ${childParts.join(', ')})`;
    }
    return `${fn}(${tagJs}, ${attrsJs})`;
  }
  if (node instanceof ImplicitDiv) {
    const el = new Element('div', {
      classes: node.classes,
      id: node.id,
      attributes: node.attributes,
      children: node.children,
      isComponent: false,
      isSelfClosing: false,
      location: node.location,
    });
    return emitChildToJs(el, state);
  }
  if (node instanceof ControlFlow) {
    return emitControlFlowToJs(node, state);
  }

  return 'null';
}

// ─── Control Flow ──────────────────────────────────────────

function emitControlFlow(
  cf: ControlFlow,
  remaining: Node[],
  state: EmitState,
  _isRoot: boolean
): void {
  if (cf.isLoop) {
    emitLoop(cf, remaining, state);
  } else {
    emitConditional(cf, remaining, state);
  }
}

function emitLoop(cf: ControlFlow, remaining: Node[], state: EmitState): void {
  // - for item in items → items.map(item => ...)
  // - for item, i in items → items.map((item, i) => ...)
  // - while condition → (() => { const __r = []; while (cond) __r.push(...); return __r; })()

  if (cf.controlKind === 'for') {
    const expr = cf.expression.source.trim();
    const forMatch = expr.match(/^(.+?)\s+in\s+(.+)$/);
    if (forMatch) {
      const vars = forMatch[1].trim(); // e.g., "item" or "item, index"
      const iterable = forMatch[2].trim();

      state.emit(`...${compileExpression(new Expression(iterable))}.map((${vars}) => `);

      // Wrap children in Fragment if multiple
      if (cf.children.length === 0) {
        state.output += 'null';
      } else if (cf.children.length === 1 && cf.children[0] instanceof Element) {
        const childJs = emitChildToJs(cf.children[0], state);
        state.output += childJs;
      } else {
        state.output += 'jsxs(Fragment, {}';
        if (cf.children.length > 0) {
          state.output += ', ';
          state.output += cf.children.map(c => emitChildToJs(c, state)).join(', ');
        }
        state.output += ')';
      }

      state.output += ')';

      // Handle remaining nodes (they go after the map)
      if (remaining.length > 0) {
        state.output += ',\n';
        emitNodes(remaining, state);
      } else {
        state.output += ';\n';
      }
      return;
    }
  }

  if (cf.controlKind === 'while') {
    const cond = compileExpression(cf.expression);
    state.emitLine(`(() => {`);
    state.indentBlock(() => {
      state.emitLine(`const __result = [];`);
      state.emitLine(`while (${cond}) {`);
      state.indentBlock(() => {
        if (cf.children.length === 1 && cf.children[0] instanceof Element) {
          state.emit(`__result.push(${emitChildToJs(cf.children[0], state)});\n`);
        } else {
          state.emit(`__result.push(jsxs(Fragment, {}, ${cf.children.map(c => emitChildToJs(c, state)).join(', ')}));\n`);
        }
      });
      state.emitLine(`}`);
      state.emitLine(`return __result;`);
    });
    state.emit(`})()`);
    if (remaining.length > 0) {
      state.output += ',\n';
      emitNodes(remaining, state);
    } else {
      state.output += ';\n';
    }
    return;
  }

  // Fallback
  state.emitLine(`/* TODO: emit loop ${cf.controlKind} */`);
}

function emitConditional(cf: ControlFlow, remaining: Node[], state: EmitState): void {
  // else is always reached via cf.next chain — the " : " was emitted by parent
  if (cf.controlKind === 'else') {
    emitElseBranch(cf, state);
    return;
  }

  // Build ternary chain: cond ? jsx(...) : (elseCond ? jsx(...) : null)
  const condition = compileExpression(cf.expression);

  if (cf.controlKind === 'unless') {
    // unless cond → !(cond)
    state.emit(`!(${condition}) ? `);
  } else {
    state.emit(`${condition} ? `);
  }

  // Then branch
  if (cf.children.length === 0) {
    state.output += 'null';
  } else if (cf.children.length === 1) {
    state.output += emitChildToJs(cf.children[0], state);
  } else {
    state.output += `jsxs(Fragment, {}, ${cf.children.map(c => emitChildToJs(c, state)).join(', ')})`;
  }

  // Else / remaining
  state.output += ' : ';

  if (cf.next) {
    emitConditional(cf.next, [], state);
  } else if (remaining.length > 0) {
    if (remaining.length === 1) {
      state.output += emitChildToJs(remaining[0], state);
    } else {
      state.output += `jsxs(Fragment, {}, ${remaining.map(c => emitChildToJs(c, state)).join(', ')})`;
    }
  } else {
    state.output += 'null';
  }

  state.output += ';\n';
}

/** Emit the body of an else branch — no condition prefix. */
function emitElseBranch(cf: ControlFlow, state: EmitState): void {
  if (cf.children.length === 0) {
    state.output += 'null';
  } else if (cf.children.length === 1) {
    state.output += emitChildToJs(cf.children[0], state);
  } else {
    state.output += `jsxs(Fragment, {}, ${cf.children.map(c => emitChildToJs(c, state)).join(', ')})`;
  }
}

function emitControlFlowToJs(cf: ControlFlow, state: EmitState): string {
  // Inline version — used when control flow appears as a child
  if (cf.isLoop && cf.controlKind === 'for') {
    const expr = cf.expression.source.trim();
    const forMatch = expr.match(/^(.+?)\s+in\s+(.+)$/);
    if (forMatch) {
      const vars = forMatch[1].trim();
      const iterable = forMatch[2].trim();
      const compiledIterable = compileExpression(new Expression(iterable));
      const body = cf.children.length === 1
        ? emitChildToJs(cf.children[0], state)
        : `jsxs(Fragment, {}, ${cf.children.map(c => emitChildToJs(c, state)).join(', ')})`;
      return `...${compiledIterable}.map((${vars}) => ${body})`;
    }
  }

  if (cf.controlKind === 'else') {
    // inline else — just emit the body
    return cf.children.length === 1
      ? emitChildToJs(cf.children[0], state)
      : cf.children.length > 0
        ? `jsxs(Fragment, {}, ${cf.children.map(c => emitChildToJs(c, state)).join(', ')})`
        : 'null';
  }

  if (cf.isConditional) {
    const condition = compileExpression(cf.expression);
    const condExpr = cf.controlKind === 'unless' ? `!(${condition})` : condition;
    const consequent = cf.children.length === 1
      ? emitChildToJs(cf.children[0], state)
      : cf.children.length > 0
        ? `jsxs(Fragment, {}, ${cf.children.map(c => emitChildToJs(c, state)).join(', ')})`
        : 'null';
    const alternate = cf.next ? emitControlFlowToJs(cf.next, state) : 'null';
    return `${condExpr} ? ${consequent} : ${alternate}`;
  }

  return 'null';
}

// ─── Text / Output / Comment / Filter / Doctype ────────────

function emitText(text: Text, state: EmitState): void {
  // Standalone text at module level — emit as string expression
  state.emitLine(`"${escapeString(text.value)}";`);
}

function emitOutput(out: Output, state: EmitState): void {
  const js = compileExpression(out.expression);
  if (out.outputKind === 'escaped') {
    // React handles escaping via jsx text children
    state.emitLine(`jsx(Fragment, {}, ${js});`);
  } else {
    state.emitLine(`jsx(Fragment, {}, ${js});`);
  }
}

function emitComment(comment: Comment, state: EmitState): void {
  if (comment.commentKind === 'html') {
    state.emitLine(`/* <!-- ${comment.text} --> */`);
  }
  // Haml comments (-#) are stripped entirely
}

function emitFilter(filter: Filter, state: EmitState): void {
  // Emit filter content as raw string (or processed depending on filter type)
  switch (filter.filterName) {
    case 'css':
      state.emitLine(`/* <style> */`);
      state.emitLine(`"${escapeString(filter.content)}";`);
      break;
    case 'javascript':
    case 'coffee':
      state.emitLine(filter.content);
      break;
    default:
      state.emitLine(`"${escapeString(filter.content)}";`);
  }
}

function emitDoctype(doctype: Doctype, state: EmitState): void {
  // Doctype is typically handled by the HTML renderer, but for React
  // we emit it as a comment or skip it
  state.emitLine(`// DOCTYPE ${doctype.value || 'html'}`);
}

// ─── Helpers ───────────────────────────────────────────────

function escapeString(s: string): string {
  return JSON.stringify(s);
}