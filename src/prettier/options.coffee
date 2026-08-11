# options.coffee — CoffeeHaml Prettier formatting options

export CAT =
  STRUCTURE:      'CoffeeHaml: Structure'
  ATTRIBUTES:     'CoffeeHaml: Attributes'
  COFFEESCRIPT:   'CoffeeHaml: CoffeeScript'
  WHITESPACE:     'CoffeeHaml: Whitespace'
  CONTROL_FLOW:   'CoffeeHaml: Control Flow'
  COMMENTS:       'CoffeeHaml: Comments'

export options =
  tagCase:
    category: CAT.STRUCTURE
    type: 'choice'
    description: 'Normalize HTML tag casing. Component tags (%MyComponent) never affected.'
    choices: [
      { value: 'preserve', description: 'Leave tag case as written' }
      { value: 'lowercase', description: '%DIV to %div (HTML tags only)' }
    ]
  implicitDivExpansion:
    category: CAT.STRUCTURE
    type: 'boolean'
    description: 'Expand .class to %div.class (anti-idiomatic in HAML).'
  maxChainLength:
    category: CAT.STRUCTURE
    type: 'int'
    description: 'Max .class chain length before breaking into indented hierarchy. 0 = always break.'
  inlineThreshold:
    category: CAT.STRUCTURE
    type: 'int'
    description: 'Try single-line if estimated width <= this. -1 = never inline children.'
  voidElementStyle:
    category: CAT.STRUCTURE
    type: 'choice'
    description: 'How void elements (%br, %img, etc.) are formatted.'
    choices: [
      { value: 'self-closing', description: 'Self-closing (no children)' }
      { value: 'explicit', description: 'Preserve %br/ syntax, otherwise self-close' }
    ]
  attributeStyle:
    category: CAT.ATTRIBUTES
    type: 'choice'
    description: 'Enforce attribute syntax: {braces}, (parens), bare, or preserve.'
    choices: [
      { value: 'preserve', description: 'Keep as written' }
      { value: 'braces', description: 'Convert to {CoffeeScript} style' }
      { value: 'parens', description: 'Convert to HTML (parens) style' }
      { value: 'bare', description: 'Convert to bare HAML style' }
    ]
  attributeMultilineThreshold:
    category: CAT.ATTRIBUTES
    type: 'int'
    description: 'Break attributes across lines when count >= this. 0 = always multiline.'
  attributeSort:
    category: CAT.ATTRIBUTES
    type: 'choice'
    description: 'Sort attribute keys (spread attributes always last).'
    choices: [
      { value: 'none', description: 'Preserve author order' }
      { value: 'alphabetical', description: 'Sort A to Z' }
      { value: 'idiomatic', description: 'id first, class second, rest A to Z' }
    ]
  quoteStyle:
    category: CAT.ATTRIBUTES
    type: 'choice'
    description: 'Quote style for bare/HAML attributes.'
    choices: [
      { value: 'preserve', description: 'Keep as written' }
      { value: 'double', description: 'Force double quotes' }
      { value: 'single', description: 'Force single quotes' }
    ]
  coffeeScriptFormat:
    category: CAT.COFFEESCRIPT
    type: 'boolean'
    description: 'Format CoffeeScript expressions using prettier/plugins/coffeescript.'
  methodChainAlign:
    category: CAT.COFFEESCRIPT
    type: 'boolean'
    description: 'Align .method chains on newlines for = expressions.'
  blankLineHandling:
    category: CAT.WHITESPACE
    type: 'choice'
    description: 'How blank lines between sibling elements are treated.'
    choices: [
      { value: 'preserve', description: 'Keep single; collapse multiples' }
      { value: 'collapse', description: 'Remove all blank lines between siblings' }
      { value: 'respect', description: 'Keep exactly as written' }
    ]
  trailingWhitespace:
    category: CAT.WHITESPACE
    type: 'choice'
    description: 'Handle trailing whitespace.'
    choices: [
      { value: 'remove', description: 'Strip trailing whitespace' }
      { value: 'preserve', description: 'Leave as written' }
    ]
  continuationStyle:
    category: CAT.CONTROL_FLOW
    type: 'choice'
    description: 'How \\ continuations are formatted.'
    choices: [
      { value: 'preserve', description: 'Keep as written' }
      { value: 'indent', description: 'Always use indented continuation' }
      { value: 'backslash', description: 'Always use \\ continuation' }
    ]
  controlFlowInline:
    category: CAT.CONTROL_FLOW
    type: 'boolean'
    description: 'Allow - if x then .ok one-liners (anti-Prettier by default).'
  statementMerging:
    category: CAT.CONTROL_FLOW
    type: 'choice'
    description: 'Merge consecutive - lines into a single indented block. Only childless statements.'
    choices: [
      { value: 'preserve', description: 'Keep each - line separate' }
      { value: 'merge', description: 'Merge consecutive childless statements into one indented block' }
    ]
  commentFormat:
    category: CAT.COMMENTS
    type: 'boolean'
    description: 'Reflow/word-wrap comment text (experimental).'

export defaultOptions =
  tagCase: 'preserve'
  implicitDivExpansion: false
  maxChainLength: 4
  inlineThreshold: -1
  voidElementStyle: 'self-closing'
  attributeStyle: 'preserve'
  attributeMultilineThreshold: 1
  attributeSort: 'none'
  quoteStyle: 'preserve'
  coffeeScriptFormat: true
  methodChainAlign: true
  blankLineHandling: 'preserve'
  trailingWhitespace: 'remove'
  continuationStyle: 'indent'
  controlFlowInline: false
  statementMerging: 'preserve'
  commentFormat: false
