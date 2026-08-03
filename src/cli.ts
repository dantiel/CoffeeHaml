#!/usr/bin/env node
import { compileFile } from './index.js';
import { writeFileSync } from 'fs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

function getVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`CoffeeHaml v${getVersion()}
  Haml structure. CoffeeScript semantics. React runtime.

Usage:
  coffeehaml compile <input> [-o <output>] [--source-map]

Options:
  -o, --output <file>   Write output to file instead of stdout
  --source-map          Emit inline source map
  -h, --help            Show this help

Examples:
  coffeehaml compile app.coffeehaml -o app.js
  coffeehaml compile app.coffeehaml                    # prints to stdout
`);
  process.exit(0);
}

const cmd = args[0];

if (cmd === 'compile') {
  const input = args[1];
  if (!input) {
    console.error('Error: no input file specified');
    process.exit(1);
  }

  const outIdx = args.indexOf('-o') !== -1 ? args.indexOf('-o') : args.indexOf('--output');
  const output = outIdx !== -1 ? args[outIdx + 1] : null;
  const sourceMap = args.includes('--source-map');

  const result = compileFile(input, { filename: input, sourceMap });

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.error(formatError(err, input));
    }
    process.exit(1);
  }

  // Print warnings to stderr
  for (const warn of result.warnings) {
    console.error(formatWarning(warn, input));
  }

  if (output) {
    writeFileSync(output, result.code);
    if (result.sourceMap) {
      writeFileSync(output + '.map', result.sourceMap);
    }
    console.error(`Compiled: ${input} → ${output}`);
  } else {
    process.stdout.write(result.code);
  }
} else {
  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}

function formatError(err: any, filename: string): string {
  const loc = err.location;
  if (loc) {
    return `${filename}:${loc.start.line + 1}:${loc.start.column + 1}: [${err.code}] ${err.message}`;
  }
  return `[${err.code}] ${err.message}`;
}

function formatWarning(warn: any, filename: string): string {
  const loc = warn.location;
  if (loc) {
    return `Warning: ${filename}:${loc.start.line + 1}:${loc.start.column + 1}: ${warn.message}`;
  }
  return `Warning: ${warn.message}`;
}