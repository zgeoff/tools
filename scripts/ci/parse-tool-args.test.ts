import { expect, test } from 'bun:test';
import { parseToolArgs } from './parse-tool-args.ts';

test.each([
  ['a known tool', ['shfmt'], { kind: 'parsed', name: 'shfmt' }],
  [
    'an unknown tool',
    ['shellcheck'],
    { kind: 'refused', message: 'usage: run-pinned-tool-step.ts <shfmt|actionlint>' },
  ],
  [
    'a second tool',
    ['shfmt', 'actionlint'],
    { kind: 'refused', message: 'usage: run-pinned-tool-step.ts <shfmt|actionlint>' },
  ],
  [
    'no tool',
    [],
    { kind: 'refused', message: 'usage: run-pinned-tool-step.ts <shfmt|actionlint>' },
  ],
  [
    'an unknown option',
    ['shfmt', '--force'],
    {
      kind: 'refused',
      message:
        "Unknown option '--force'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- \"--force\"\nusage: run-pinned-tool-step.ts <shfmt|actionlint>",
    },
  ],
])('it reads %s from the arguments', (_label, args, expected) => {
  const parsed: unknown = parseToolArgs(args, ['shfmt', 'actionlint']);

  expect(parsed).toStrictEqual(expected);
});
