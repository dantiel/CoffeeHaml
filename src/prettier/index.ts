// CoffeeHaml Prettier Plugin — Entry Point
//
// Auto-discovered by Prettier when listed in plugins.
// Usage in .prettierrc: { "plugins": ["prettier-plugin-coffeehaml"] }

import type { Plugin, Parser, Printer, SupportLanguage, ParserOptions, Options, AstPath, Doc } from 'prettier';
import { tokenize } from '../lexer.js';
import { parse } from '../parser.js';
import { Node } from '../ast.js';
import { print, CoffeeHamlFormatOptions } from './printer.js';
import { options, defaultOptions } from './options.js';

// ─── Language ──────────────────────────────────────────────

const coffeeHamlLanguage: SupportLanguage = {
  name: 'CoffeeHaml',
  parsers: ['coffeehaml'],
  extensions: ['.chaml', '.coffeehaml'],
  vscodeLanguageIds: ['coffeehaml'],
};

// ─── Parser ────────────────────────────────────────────────

const coffeeHamlParser: Parser<Node> = {
  parse(text: string, _options: ParserOptions<Node>): Node {
    const tokens = tokenize(text);
    const result = parse(tokens);
    if (result.errors.length > 0 && result.document.children.length === 0) {
      throw new Error(
        'CoffeeHaml parse errors:\n' +
        result.errors.map(e => `  ${e.message}`).join('\n')
      );
    }
    return result.document as unknown as Node;
  },

  astFormat: 'coffeehaml-ast',

  locStart(node: any): number {
    return node?.location?.offset ?? 0;
  },
  locEnd(node: any): number {
    if (!node?.location) return 0;
    return node.location.offset + node.location.length;
  },
  hasPragma(text: string): boolean {
    return /\/\*\*\s*@format\s*\*\//.test(text) || /^\/\s*@format/.test(text);
  },
};

// ─── Printer ───────────────────────────────────────────────

const coffeeHamlPrinter: Printer<Node> = {
  print(
    path: AstPath<Node>,
    options: ParserOptions<Node>,
    printFn: (selector?: string | number | AstPath<Node> | (string | number)[] | undefined, args?: unknown) => Doc,
    _args?: unknown,
  ): Doc {
    // Merge Prettier core options + our plugin options into CoffeeHamlFormatOptions
    const opts = options as unknown as CoffeeHamlFormatOptions;
    return print(path, opts, printFn);
  },

  embed(
    _path: AstPath<Node>,
    _options: Options,
  ): any {
    return undefined; // Phase 4
  },

  insertPragma(text: string): string {
    return '/** @format */\n' + text;
  },
};

// ─── Export ────────────────────────────────────────────────

const plugin: Plugin<Node> = {
  languages: [coffeeHamlLanguage],
  parsers: { coffeehaml: coffeeHamlParser },
  printers: { 'coffeehaml-ast': coffeeHamlPrinter },
  options,
  defaultOptions,
};

export default plugin;
export { options, defaultOptions } from './options.js';
export { print } from './printer.js';
export type { CoffeeHamlFormatOptions } from './printer.js';
