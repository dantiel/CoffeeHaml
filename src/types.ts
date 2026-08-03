/** Line/column position in source. */
export interface SourcePosition {
  line: number;   // 0-based
  column: number; // 0-based
}

/** Span within source file. */
export interface SourceLocation {
  start: SourcePosition;
  end: SourcePosition;
  offset: number;  // byte offset from start of file
  length: number;  // byte length
  file?: string;   // source file path
}

/** Compiler options. */
export interface CompilerOptions {
  /** Source file path (for error messages and source maps). */
  filename?: string;
  /** Emit source map alongside output. */
  sourceMap?: boolean;
  /** React JSX runtime import source. */
  jsxRuntime?: string;
  /** JSX import style: 'classic' (React) or 'automatic' (default). */
  jsxImportSource?: string;
}

/** Compiler result. */
export interface CompileResult {
  code: string;
  sourceMap?: string;
  errors: CompileError[];
  warnings: CompileWarning[];
}

/** Compiler error with source location. */
export class CompileError extends Error {
  location?: SourceLocation;
  phase: string;
  hint?: string;
  code: string;

  constructor(message: string, phase: string, code: string, location?: SourceLocation, hint?: string) {
    super(message);
    this.name = 'CompileError';
    this.phase = phase;
    this.code = code;
    this.location = location;
    this.hint = hint;
  }
}

/** Compiler warning. */
export interface CompileWarning {
  message: string;
  location?: SourceLocation;
  phase: string;
}

/** Emitter options. */
export interface EmitterOptions {
  sourceMap?: boolean;
  filename?: string;
  jsxRuntime?: string;
}

/** Emitter result. */
export interface EmitResult {
  code: string;
  sourceMap?: string;
}
