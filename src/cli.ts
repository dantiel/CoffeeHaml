#!/usr/bin/env node
import { compileFile } from './index.js';
import { writeFileSync, readFileSync, existsSync, watch, statSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, relative } from 'path';
import { CompilerOptions } from './types.js';

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
  coffeehaml compile <input> [-o <output>] [--source-map] [--wrap <mode>]
  coffeehaml watch <input> [-o <output>] [--source-map] [--wrap <mode>]

Options:
  -o, --output <file>   Write output to file instead of stdout
  --source-map          Emit inline source map
  --wrap <mode>         Wrap output: 'component', 'observer', or comma-separated HOC list
  -h, --help            Show this help

Examples:
  coffeehaml compile app.chaml -o app.js --wrap component
  coffeehaml compile app.chaml                         # prints to stdout
  coffeehaml watch src/ --wrap observer                # watch and recompile on change
`);
  process.exit(0);
}

function parseWrapFlag(args: string[]): CompilerOptions['wrap'] {
  const idx = args.indexOf('--wrap');
  if (idx === -1) return undefined;
  const val = args[idx + 1];
  if (!val || val.startsWith('-')) return undefined;
  // 'component' and 'observer' are shorthands; comma-separated → string[]
  if (val === 'component' || val === 'observer') return val;
  if (val === 'none') return 'none';
  return val.split(',').map(s => s.trim()).filter(Boolean);
}

function parseArgs(args: string[]): { input?: string; output?: string; sourceMap: boolean; wrap: CompilerOptions['wrap'] } {
  const outIdx = args.indexOf('-o') !== -1 ? args.indexOf('-o') : args.indexOf('--output');
  const output = outIdx !== -1 ? args[outIdx + 1] : undefined;
  const sourceMap = args.includes('--source-map');
  const wrap = parseWrapFlag(args);
  return { input: args[0], output, sourceMap, wrap };
}

function formatError(err: any, filename: string): string {
  const loc = err.location;
  let msg = loc
    ? `${filename}:${loc.start.line + 1}:${loc.start.column + 1}: [${err.code}] ${err.message}`
    : `[${err.code}] ${err.message}`;
  if (err.hint) msg += `\n  Hint: ${err.hint}`;
  return msg;
}

function formatWarning(warn: any, filename: string): string {
  const loc = warn.location;
  if (loc) {
    return `Warning: ${filename}:${loc.start.line + 1}:${loc.start.column + 1}: ${warn.message}`;
  }
  return `Warning: ${warn.message}`;
}

function doCompile(input: string, opts: ReturnType<typeof parseArgs>): boolean {
  const result = compileFile(input, { filename: input, sourceMap: opts.sourceMap, wrap: opts.wrap });

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.error(formatError(err, input));
    }
    return false;
  }

  for (const warn of result.warnings) {
    console.error(formatWarning(warn, input));
  }

  if (opts.output) {
    writeFileSync(opts.output, result.code);
    if (result.sourceMap) {
      writeFileSync(opts.output + '.map', result.sourceMap);
    }
    console.error(`Compiled: ${input} → ${opts.output}`);
  } else {
    process.stdout.write(result.code);
  }
  return true;
}

const cmd = args[0];
const rest = args.slice(1);

if (cmd === 'compile') {
  const opts = parseArgs(rest);
  if (!opts.input) {
    console.error('Error: no input file specified');
    process.exit(1);
  }
  const ok = doCompile(opts.input, opts);
  process.exit(ok ? 0 : 1);
} else if (cmd === 'watch') {
  const opts = parseArgs(rest);
  if (!opts.input) {
    console.error('Error: no input path specified');
    process.exit(1);
  }

  const target = resolve(opts.input);
  const stats = existsSync(target) ? statSync(target) : null;

  // Collect .chaml/.coffeehaml files
  const files: string[] = [];
  function findFiles(dir: string) {
    if (!existsSync(dir)) return;
    const stat = statSync(dir);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          findFiles(full);
        } else if (entry.isFile() && /\.(chaml|coffeehaml)$/.test(entry.name)) {
          files.push(full);
        }
      }
    } else if (/\.(chaml|coffeehaml)$/.test(dir)) {
      files.push(dir);
    }
  }
  findFiles(target);

  if (files.length === 0) {
    console.error(`Error: no .chaml/.coffeehaml files found in ${opts.input}`);
    process.exit(1);
  }

  console.error(`Watching ${files.length} file(s)...`);
  let initial = true;
  const compile = (file: string) => {
    const rel = relative(process.cwd(), file);
    if (!initial) console.error(`\n[recompile] ${rel}`);
    initial = false;

    // Derive output: same dir, .js extension
    const outFile = opts.output || file.replace(/\.(chaml|coffeehaml)$/, '.js');
    const ok = doCompile(file, { ...opts, output: outFile, input: file });
    if (!ok) console.error(`  ✗ ${rel}`);
  };

  for (const file of files) compile(file);

  // Watch each file for changes (debounced)
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const watchDir = stats?.isDirectory() ? target : dirname(target);
  const watcher = watch(watchDir, { recursive: true }, (_event, filename) => {
    if (!filename || !/\.(chaml|coffeehaml)$/.test(filename)) return;
    const full = resolve(watchDir, filename);
    if (timers.has(full)) clearTimeout(timers.get(full));
    timers.set(full, setTimeout(() => {
      timers.delete(full);
      compile(full);
    }, 100));
  });

  process.on('SIGINT', () => {
    watcher.close();
    console.error('\nStopped watching.');
    process.exit(0);
  });
} else {
  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}