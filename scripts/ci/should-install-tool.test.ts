import { expect, test } from 'bun:test';
import { shouldInstallTool } from './should-install-tool.ts';

test.each([
  ['the static job', 'static', 'false', true],
  ['the private checks job', 'all', 'false', true],
  ['a test job whose caller asks for it', 'test', 'true', true],
  ['a test job', 'test', 'false', false],
  ['a lane job', 'lane', 'false', false],
  ['a lane job whose caller asks for it', 'lane', 'true', true],
])(
  'it installs a check tool for %s only when the job runs its check or the caller asks',
  (_label, part, requested, expected) => {
    expect(shouldInstallTool(part, requested)).toBe(expected);
  },
);
