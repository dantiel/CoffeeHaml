#!/usr/bin/env node
import { compileFile } from './index.js';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`CoffeeHaml v0.1.0
  Haml structure. CoffeeScript semantics. React runtime.

Usage:
  coffeehaml compile <input> [-o <output>]

Examples:
  coffeehaml compile app.coffeehaml -o app.js
  coffeehaml compile app.coffeehaml              # prints to stdout
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

  const outIdx = args.indexOf('-o');
  const output = outIdx !== -1 ? args[outIdx + 1] : null;

  const result = compileFile(input, { filename: input, sourceMap: true });

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.error(formatError(err, input));
    }
    process.exit(1);
  }

  if (output) {
    const fs = await import('fs');
    fs.writeFileSync(output, result.code);
    console.log(`Compiled: ${input} → ${output}`);
  } else {
    console.log(result.code);
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
