/**
 * CoffeeHaml Prettier Plugin — Formatting Options
 *
 * Every formatting feature is independently deactivatable.
 * 'preserve', false, or -1 means "leave as-is, no intervention."
 */

import type { ChoiceSupportOption, BooleanSupportOption, IntSupportOption, SupportOption } from 'prettier';

// ─── Category labels ───────────────────────────────────────

const CAT = {
  STRUCTURE: 'CoffeeHaml: Structure',
  ATTRIBUTES: 'CoffeeHaml: Attributes',
  COFFEESCRIPT: 'CoffeeHaml: CoffeeScript',
  WHITESPACE: 'CoffeeHaml: Whitespace',
  CONTROL_FLOW: 'CoffeeHaml: Control Flow',
  COMMENTS: 'CoffeeHaml: Comments',
} as const;

// ─── Option definitions ────────────────────────────────────

/** Tag name case normalization. 'preserve' = leave as written. */
const tagCase: ChoiceSupportOption<'preserve' | 'lowercase'> = {
  category: CAT.STRUCTURE,
  type: 'choice',
  description: 'Normalize HTML tag casing. Component tags (%MyComponent) never affected.',
  choices: [
    { value: 'preserve', description: 'Leave tag case as written' },
    { value: 'lowercase', description: '%DIV to %div (HTML tags only)' },
  ],
};

/** Expand .class to %div.class. */
const implicitDivExpansion: BooleanSupportOption = {
  category: CAT.STRUCTURE,
  type: 'boolean',
  description: 'Expand .class to %div.class (anti-idiomatic in HAML).',
};

/** Max .class chain length before breaking into indented hierarchy. */
const maxChainLength: IntSupportOption = {
  category: CAT.STRUCTURE,
  type: 'int',
  description: 'Max .class chain length before breaking into indented hierarchy. 0 = always break.',
};

/** Threshold for single-line vs multi-line layout. */
const inlineThreshold: IntSupportOption = {
  category: CAT.STRUCTURE,
  type: 'int',
  description: 'Try single-line if estimated width <= this. -1 = never inline children.',
};

/** Self-closing style for void elements. */
const voidElementStyle: ChoiceSupportOption<'self-closing' | 'explicit'> = {
  category: CAT.STRUCTURE,
  type: 'choice',
  description: 'How void elements (%br, %img, etc.) are formatted.',
  choices: [
    { value: 'self-closing', description: 'Self-closing (no children)' },
    { value: 'explicit', description: 'Preserve %br/ syntax, otherwise self-close' },
  ],
};

/** Enforce a specific attribute syntax style. */
const attributeStyle: ChoiceSupportOption<'preserve' | 'braces' | 'parens' | 'bare'> = {
  category: CAT.ATTRIBUTES,
  type: 'choice',
  description: 'Enforce attribute syntax: {braces}, (parens), bare, or preserve.',
  choices: [
    { value: 'preserve', description: 'Keep as written' },
    { value: 'braces', description: 'Convert to {CoffeeScript} style' },
    { value: 'parens', description: 'Convert to HTML (parens) style' },
    { value: 'bare', description: 'Convert to bare HAML style' },
  ],
};

/** Number of attributes before forcing multiline layout. */
const attributeMultilineThreshold: IntSupportOption = {
  category: CAT.ATTRIBUTES,
  type: 'int',
  description: 'Break attributes across lines when count >= this. 0 = always multiline.',
};

/** Sort attribute keys. */
const attributeSort: ChoiceSupportOption<'none' | 'alphabetical' | 'idiomatic'> = {
  category: CAT.ATTRIBUTES,
  type: 'choice',
  description: 'Sort attribute keys (spread attributes always last).',
  choices: [
    { value: 'none', description: 'Preserve author order' },
    { value: 'alphabetical', description: 'Sort A to Z' },
    { value: 'idiomatic', description: 'id first, class second, rest A to Z' },
  ],
};

/** Quote style for bare/HAML attributes. */
const quoteStyle: ChoiceSupportOption<'preserve' | 'double' | 'single'> = {
  category: CAT.ATTRIBUTES,
  type: 'choice',
  description: 'Quote style for bare/HAML attributes.',
  choices: [
    { value: 'preserve', description: 'Keep as written' },
    { value: 'double', description: 'Force double quotes' },
    { value: 'single', description: 'Force single quotes' },
  ],
};

/** Format embedded CoffeeScript via Prettier's CS plugin. */
const coffeeScriptFormat: BooleanSupportOption = {
  category: CAT.COFFEESCRIPT,
  type: 'boolean',
  description: 'Format CoffeeScript expressions using prettier/plugins/coffeescript.',
};

/** Align chained method calls on newlines. */
const methodChainAlign: BooleanSupportOption = {
  category: CAT.COFFEESCRIPT,
  type: 'boolean',
  description: 'Align .method chains on newlines for = expressions.',
};

/** Blank line handling between sibling elements. */
const blankLineHandling: ChoiceSupportOption<'preserve' | 'collapse' | 'respect'> = {
  category: CAT.WHITESPACE,
  type: 'choice',
  description: 'How blank lines between sibling elements are treated.',
  choices: [
    { value: 'preserve', description: 'Keep single; collapse multiples' },
    { value: 'collapse', description: 'Remove all blank lines between siblings' },
    { value: 'respect', description: 'Keep exactly as written' },
  ],
};

/** Trailing whitespace handling. */
const trailingWhitespace: ChoiceSupportOption<'remove' | 'preserve'> = {
  category: CAT.WHITESPACE,
  type: 'choice',
  description: 'Handle trailing whitespace.',
  choices: [
    { value: 'remove', description: 'Strip trailing whitespace' },
    { value: 'preserve', description: 'Leave as written' },
  ],
};

/** Control flow \\ continuation style. */
const continuationStyle: ChoiceSupportOption<'preserve' | 'indent' | 'backslash'> = {
  category: CAT.CONTROL_FLOW,
  type: 'choice',
  description: 'How \\ continuations are formatted.',
  choices: [
    { value: 'preserve', description: 'Keep as written' },
    { value: 'indent', description: 'Always use indented continuation' },
    { value: 'backslash', description: 'Always use \\ continuation' },
  ],
};

/** Inline control flow with 'then'. */
const controlFlowInline: BooleanSupportOption = {
  category: CAT.CONTROL_FLOW,
  type: 'boolean',
  description: 'Allow - if x then .ok one-liners (anti-Prettier by default).',
};

/** Merge consecutive standalone - statements into indented block. */
const statementMerging: ChoiceSupportOption<'preserve' | 'merge'> = {
  category: CAT.CONTROL_FLOW,
  type: 'choice',
  description: 'Merge consecutive - lines into a single indented block. Only childless statements.',
  choices: [
    { value: 'preserve', description: 'Keep each - line separate' },
    { value: 'merge', description: 'Merge consecutive childless statements into one indented block' },
  ],
};

/** Reflow/format comment text. */
const commentFormat: BooleanSupportOption = {
  category: CAT.COMMENTS,
  type: 'boolean',
  description: 'Reflow/word-wrap comment text (experimental).',
};

// ─── Exports ────────────────────────────────────────────────

export const options: Record<string, SupportOption> = {
  tagCase,
  implicitDivExpansion,
  maxChainLength,
  inlineThreshold,
  voidElementStyle,
  attributeStyle,
  attributeMultilineThreshold,
  attributeSort,
  quoteStyle,
  coffeeScriptFormat,
  methodChainAlign,
  blankLineHandling,
  trailingWhitespace,
  continuationStyle,
  controlFlowInline,
  statementMerging,
  commentFormat,
};

export const defaultOptions: Record<string, any> = {
  tagCase: 'preserve',
  implicitDivExpansion: false,
  maxChainLength: 4,
  inlineThreshold: -1,
  voidElementStyle: 'self-closing',
  attributeStyle: 'preserve',
  attributeMultilineThreshold: 1,
  attributeSort: 'none',
  quoteStyle: 'preserve',
  coffeeScriptFormat: true,
  methodChainAlign: true,
  blankLineHandling: 'preserve',
  trailingWhitespace: 'remove',
  continuationStyle: 'indent',
  controlFlowInline: false,
  statementMerging: 'preserve',
  commentFormat: false,
};