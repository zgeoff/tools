import { parseArgs } from 'node:util';

// Only a hook that passes `--pushed-refs` hands over stdin; a manual run leaves stdin a terminal,
// where a read waits for input.
export function readPushedRefsInput(args: readonly string[]): Promise<string | null> {
  const parsed = parseArgs({
    args: [...args],
    options: { 'pushed-refs': { type: 'boolean' } },
    strict: true,
  });

  return parsed.values['pushed-refs'] === true ? Bun.stdin.text() : Promise.resolve(null);
}
