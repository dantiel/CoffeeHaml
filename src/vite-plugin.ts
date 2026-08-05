import type { Plugin } from 'vite';
import { compile } from './compiler.js';
import type { CompilerOptions } from './types.js';
import { basename } from 'path';

export interface CoffeeHamlPluginOptions {
  compilerOptions?: CompilerOptions;
}

const COFFEEHAML_RE = /\.(coffeehaml|cohaml|chaml)$/;

/** Derive a PascalCase component name from a filename stem. */
function componentNameFromPath(filepath: string): string {
  const stem = basename(filepath).split('.').shift() || 'Component';
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

export default function coffeehaml(options: CoffeeHamlPluginOptions = {}): Plugin {
  // Default to component mode — the only sensible default for Vite/React projects
  const compilerOpts: CompilerOptions = {
    sourceMap: true,
    wrap: 'component',
    ...options.compilerOptions,
  };

  return {
    name: 'coffeehaml',

    transform(code: string, id: string) {
      if (!COFFEEHAML_RE.test(id)) return;

      const result = compile(code, {
        ...compilerOpts,
        filename: id,
        componentName: compilerOpts.componentName || componentNameFromPath(id),
      });

      // Inject React Fast Refresh pragma and HMR accept when in component mode
      let preamble = '';
      let postamble = '';
      if (compilerOpts.wrap && compilerOpts.wrap !== 'none' && !compilerOpts.wrap.includes) {
        // Component or observer mode — add Fast Refresh support
        preamble = '// @refresh reset\n';
        const name = compilerOpts.componentName || componentNameFromPath(id);
        postamble = `\nif (import.meta.hot) {\n  import.meta.hot.accept((mod) => {\n    if (mod?.${name}) import.meta.hot?.data?.refresh?.();\n  });\n}\n`;
      }

      const finalCode = preamble + result.code + postamble;

      if (result.errors.length > 0) {
        const err = result.errors[0];
        this.error({
          message: err.message,
          id,
          // @ts-ignore
          loc: err.location ? {
            line: err.location.start.line + 1,
            column: err.location.start.column + 1,
          } : undefined,
        });
        return null;
      }

      return {
        code: finalCode,
        map: result.sourceMap ? { mappings: result.sourceMap } as any : null,
      };
    },

    handleHotUpdate({ file, server }) {
      if (COFFEEHAML_RE.test(file)) {
        // Invalidate and reload — the transform hook will recompile
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}