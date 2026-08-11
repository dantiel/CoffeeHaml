#!/usr/bin/env node
# cli.coffee — CoffeeHaml command-line interface

import { compileFile } from './index.js'
import { writeFileSync, readFileSync, existsSync, watch, statSync, readdirSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, resolve, relative } from 'path'
import { createInterface } from 'readline'
import { createRequire } from 'module'

_require = createRequire import.meta.url

getVersion = ->
  try
    __dirname = dirname fileURLToPath import.meta.url
    pkg = JSON.parse readFileSync join(__dirname, '..', 'package.json'), 'utf-8'
    pkg.version or '0.0.0'
  catch
    '0.0.0'

args = process.argv.slice 2

if args.length is 0 or '--help' in args or '-h' in args
  console.log """
    CoffeeHaml v#{getVersion()}
      Haml structure. CoffeeScript semantics. React runtime.

    Usage:
      coffeehaml init                                        scaffold a new project
      coffeehaml compile <input> [-o <output>] [--source-map] [--wrap <mode>]
      coffeehaml watch <input> [-o <output>] [--source-map] [--wrap <mode>]

    Options:
      -o, --output <file>   Write output to file instead of stdout
      --source-map          Emit inline source map
      --wrap <mode>         Wrap output: 'component', 'observer', or comma-separated HOC list
      -h, --help            Show this help

    Examples:
      coffeehaml init
      coffeehaml compile app.chaml -o app.js --wrap component
      coffeehaml compile app.chaml                           # prints to stdout
      coffeehaml watch src/ --wrap observer                  # watch and recompile on change
  """
  process.exit 0

parseWrapFlag = (args) ->
  idx = args.indexOf '--wrap'
  return undefined if idx is -1
  val = args[idx + 1]
  return undefined unless val and not val.startsWith '-'
  return val if val in ['component', 'observer', 'none']
  val.split(',').map((s) -> s.trim()).filter Boolean

parseArgs = (args) ->
  outIdx = if args.indexOf('-o') isnt -1 then args.indexOf '-o' else args.indexOf '--output'
  output = if outIdx isnt -1 then args[outIdx + 1] else undefined
  sourceMap = '--source-map' in args
  wrap = parseWrapFlag args
  { input: args[0], output, sourceMap, wrap }

formatError = (err, filename) ->
  loc = err.location
  msg = if loc
    "#{filename}:#{loc.start.line + 1}:#{loc.start.column + 1}: [#{err.code}] #{err.message}"
  else
    "[#{err.code}] #{err.message}"
  msg += "\n  Hint: #{err.hint}" if err.hint
  msg

formatWarning = (warn, filename) ->
  loc = warn.location
  if loc
    "Warning: #{filename}:#{loc.start.line + 1}:#{loc.start.column + 1}: #{warn.message}"
  else
    "Warning: #{warn.message}"

doCompile = (input, opts) ->
  result = compileFile input,
    filename: input
    sourceMap: opts.sourceMap
    wrap: opts.wrap

  if result.errors.length > 0
    for err in result.errors
      console.error formatError err, input
    return false

  for warn in result.warnings
    console.error formatWarning warn, input

  if opts.output
    writeFileSync opts.output, result.code
    if result.sourceMap
      writeFileSync opts.output + '.map', result.sourceMap
    console.error "Compiled: #{input} → #{opts.output}"
  else
    process.stdout.write result.code
  true

# ─── Init ──────────────────────────────────────────────────

ask = (q) ->
  rl = createInterface input: process.stdin, output: process.stdout
  new Promise (resolve) ->
    rl.question q, (answer) ->
      rl.close()
      resolve answer.trim()

doInit = ->
  cwd = process.cwd()
  hasPkg = existsSync join cwd, 'package.json'
  hasViteConfig = existsSync(join cwd, 'vite.config.ts') or existsSync(join cwd, 'vite.config.js')
  hasTsConfig = existsSync join cwd, 'tsconfig.json'

  console.log "\n  ☕ CoffeeHaml init — project scaffold\n"
  console.log "  Working directory: #{cwd}"

  detections = []
  detections.push 'package.json' if hasPkg
  detections.push 'Vite' if hasViteConfig
  detections.push 'TypeScript' if hasTsConfig
  detections.push 'bare project' unless hasPkg
  console.log "  Detected: #{detections.join ', '}\n"

  addDep = true
  if hasPkg
    ans = await ask '  Add coffeehaml as devDependency? (Y/n): '
    addDep = not /^n/i.test ans
  else
    console.log '  No package.json found — skipping dependency install.'
    addDep = false

  setupVite = false
  if hasViteConfig
    ans = await ask '  Configure Vite plugin? (Y/n): '
    setupVite = not /^n/i.test ans
  else if hasPkg
    ans = await ask '  No vite.config detected. Create one with CoffeeHaml plugin? (y/N): '
    setupVite = /^y/i.test ans

  createSample = true
  ans = await ask '  Create sample .chaml component? (Y/n): '
  createSample = not /^n/i.test ans

  addScripts = false
  if hasPkg
    ans = await ask '  Add build/watch scripts to package.json? (Y/n): '
    addScripts = not /^n/i.test ans

  console.log ''

  # Execute
  if addDep
    console.log '  ⚡ Installing coffeehaml...'
    { execSync } = _require 'child_process'
    try
      execSync 'npm install --save-dev coffeehaml', cwd: cwd, stdio: 'inherit'
      console.log '  ✓ coffeehaml installed\n'
    catch
      console.log '  ✗ Install failed — continuing anyway\n'

  if setupVite
    configPath = if hasViteConfig
      if existsSync(join cwd, 'vite.config.ts') then join(cwd, 'vite.config.ts') else join(cwd, 'vite.config.js')
    else
      join cwd, 'vite.config.ts'
    ext = if configPath.endsWith '.ts' then 'ts' else 'js'

    if hasViteConfig
      existing = readFileSync configPath, 'utf-8'
      hasImport = /coffeehaml/.test existing
      hasPlugin = /coffeehaml\(\)/.test existing

      unless hasImport
        existing = "import coffeehaml from 'coffeehaml/vite-plugin';\n" + existing
      unless hasPlugin
        existing = existing.replace /(plugins\s*:\s*\[)/, '$1\n    coffeehaml(),'
        unless /plugins\s*:\s*\[/.test existing
          existing = existing.replace /(defineConfig\s*\(\s*\{)/, '$1\n  plugins: [coffeehaml()],'

      writeFileSync configPath, existing
      console.log "  ✓ Updated #{relative cwd, configPath}\n"
    else
      content = """import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import coffeehaml from 'coffeehaml/vite-plugin';

export default defineConfig({
  plugins: [
    react(),
    coffeehaml(),
  ],
});"""
      writeFileSync configPath, content
      console.log "  ✓ Created #{relative cwd, configPath}\n"

  if createSample
    srcDir = join cwd, 'src'
    unless existsSync srcDir
      mkdirSync srcDir, recursive: true
    samplePath = join srcDir, 'App.chaml'
    if existsSync samplePath
      console.log "  ⚠ #{relative cwd, samplePath} already exists — skipping\n"
    else
      sample = """-# App.chaml — a sample CoffeeHaml component
import { useState } from 'react'

%div.app
  %header
    %h1= "CoffeeHaml ✨"
    %p.subtitle Haml structure. CoffeeScript semantics. React runtime.

  %main
    - name = 'World'
    %section.card
      %h2= "Hello, \#{name}!"
      %p= "Counter: 0"

    %footer
      %small Built with coffeehaml v#{getVersion()}
"""
      writeFileSync samplePath, sample
      console.log "  ✓ Created #{relative cwd, samplePath}\n"

  if addScripts and hasPkg
    pkgPath = join cwd, 'package.json'
    pkg = JSON.parse readFileSync pkgPath, 'utf-8'
    pkg.scripts = pkg.scripts or {}
    unless pkg.scripts['build:chaml']
      pkg.scripts['build:chaml'] = 'coffeehaml compile src/ -o dist/'
    unless pkg.scripts['watch:chaml']
      pkg.scripts['watch:chaml'] = 'coffeehaml watch src/ --wrap component'
    writeFileSync pkgPath, JSON.stringify(pkg, null, 2) + '\n'
    console.log '  ✓ Added build:chaml and watch:chaml scripts\n'

  console.log '  🎉 Done! Start building:\n'
  console.log '    npm run build:chaml       # compile once'
  console.log '    npm run watch:chaml       # watch and recompile'
  console.log '    npx coffeehaml watch src/ # ad-hoc watch\n'

# ─── Main ──────────────────────────────────────────────────

cmd = args[0]
rest = args.slice 1

switch cmd
  when 'compile'
    opts = parseArgs rest
    unless opts.input
      console.error 'Error: no input file specified'
      process.exit 1
    ok = doCompile opts.input, opts
    process.exit if ok then 0 else 1

  when 'watch'
    opts = parseArgs rest
    unless opts.input
      console.error 'Error: no input path specified'
      process.exit 1

    target = resolve opts.input
    stats = if existsSync target then statSync target else null

    files = []
    findFiles = (dir) ->
      return unless existsSync dir
      stat = statSync dir
      if stat.isDirectory()
        for entry in readdirSync dir, withFileTypes: true
          full = join dir, entry.name
          if entry.isDirectory() and not entry.name.startsWith('.') and entry.name isnt 'node_modules'
            findFiles full
          else if entry.isFile() and /\.(chaml|coffeehaml)$/.test entry.name
            files.push full
      else if /\.(chaml|coffeehaml)$/.test dir
        files.push dir

    findFiles target

    if files.length is 0
      console.error "Error: no .chaml/.coffeehaml files found in #{opts.input}"
      process.exit 1

    console.error "Watching #{files.length} file(s)..."
    initial = true
    compileFn = (file) ->
      rel = relative process.cwd(), file
      unless initial
        console.error "\n[recompile] #{rel}"
      initial = false
      outFile = opts.output or file.replace(/\.(chaml|coffeehaml)$/, '.js')
      ok = doCompile file, {opts..., output: outFile, input: file}
      console.error "  ✗ #{rel}" unless ok

    compileFn file for file in files

    timers = new Map()
    watchDir = if stats?.isDirectory() then target else dirname target
    watcher = watch watchDir, recursive: true, (_event, filename) ->
      return unless filename and /\.(chaml|coffeehaml)$/.test filename
      full = resolve watchDir, filename
      clearTimeout timers.get full if timers.has full
      timers.set full, setTimeout (->
        timers.delete full
        compileFn full
      ), 100

    process.on 'SIGINT', ->
      watcher.close()
      console.error '\nStopped watching.'
      process.exit 0

  when 'init'
    doInit()

  else
    console.error "Unknown command: #{cmd}"
    process.exit 1