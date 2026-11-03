import type { OxcParserModule } from './oxc-parser-module.ts';

// The module name is built at run time, so the step bundle that CI downloads leaves oxc-parser out:
// its native binding fails at import time on a runner with no node_modules, which would break every
// check in the bundle. Only this check needs the parser, and it runs from an install.
export async function readOxcParser(): Promise<OxcParserModule> {
  const loaded: unknown = await import(['oxc', 'parser'].join('-'));

  if (!isOxcParserModule(loaded)) {
    throw new Error('oxc-parser exports no parseSync and no Visitor');
  }

  return loaded;
}

function isOxcParserModule(value: unknown): value is OxcParserModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'parseSync') === 'function' &&
    typeof Reflect.get(value, 'Visitor') === 'function'
  );
}
