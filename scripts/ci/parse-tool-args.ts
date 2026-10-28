import { parseArgs } from 'node:util';

export type ToolArgs =
  | { readonly kind: 'parsed'; readonly name: string }
  | { readonly kind: 'refused'; readonly message: string };

export function parseToolArgs(args: readonly string[], names: readonly string[]): ToolArgs {
  const usage = `usage: run-pinned-tool-step.ts <${names.join('|')}>`;

  try {
    const positionals = parseArgs({
      args: [...args],
      options: {},
      allowPositionals: true,
      strict: true,
    }).positionals;

    const [name] = positionals;

    return positionals.length === 1 && name !== undefined && names.includes(name)
      ? { kind: 'parsed', name }
      : { kind: 'refused', message: usage };
  } catch (error) {
    return {
      kind: 'refused',
      message: `${error instanceof Error ? error.message : String(error)}\n${usage}`,
    };
  }
}
