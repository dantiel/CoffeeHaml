import type { Plugin } from 'vite';
import { compile } from './compiler.js';
import type { CompilerOptions } from './types.js';

export interface CoffeeHamlPluginOptions {
  compilerOptions?: CompilerOptions;
}

const COFFEEHAML_RE = /\.(coffeehaml|cohaml|chaml)$/;

export default function coffeehaml(options: CoffeeHamlPluginOptions = {}): Plugin {
  const compilerOpts: CompilerOptions = {
    sourceMap: true,
    ...options.compilerOptions,
  };

  return {
    name: 'coffeehaml',

    transform(code: string, id: string) {
      if (!COFFEEHAML_RE.test(id)) return;

      const result = compile(code, {
        ...compilerOpts,
        filename: id,
      });

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
        code: result.code,
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