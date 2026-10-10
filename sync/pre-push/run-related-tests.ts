// Runs the repo's test script over the tests beside the given files: a test file
// runs itself, and a source file runs its sibling test file.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function runRelatedTests(paths: readonly string[], cwd: string): Promise<number> {
  const tests = collectRelatedTests(paths, cwd);

  if (tests.length === 0) {
    process.stdout.write('run-related-tests: no related tests\n');

    return Promise.resolve(0);
  }

  // bun test reads a bare argument as a name filter; the ./ makes it a path.
  const run = Bun.spawn(['bun', 'run', 'test', ...tests.map((path) => `./${path}`)], {
    cwd,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  return run.exited;
}

export function collectRelatedTests(paths: readonly string[], cwd: string): string[] {
  const selected = new Set<string>();

  for (const path of paths) {
    const test = findRelatedTest(path);

    if (test !== undefined && existsSync(join(cwd, test))) {
      selected.add(test);
    }
  }

  return [...selected];
}

const sourcePattern = /^(?<stem>.+?)(?:\.test)?(?<ext>\.tsx?)$/u;

function findRelatedTest(path: string): string | undefined {
  const groups = sourcePattern.exec(path)?.groups;

  if (groups === undefined || path.endsWith('.d.ts')) {
    return undefined;
  }

  return `${groups['stem']}.test${groups['ext']}`;
}

if (import.meta.main) {
  const exitCode = await runRelatedTests(process.argv.slice(2), process.cwd());

  process.exit(exitCode);
}
