import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

test('it prints its usage when a file argument is missing', () => {
  const scriptPath = fileURLToPath(new URL('run-audit-fix.ts', import.meta.url));
  const result = Bun.spawnSync(['bun', scriptPath, '--title-file', 'title.txt']);

  expect(result.exitCode).toBe(1);

  expect(result.stderr.toString()).toContain(
    'usage: run-audit-fix.ts --title-file <path> --body-file <path> --review-file <path> [--pending-ignores <path>] [--expiry-days <1-90>]',
  );
});
