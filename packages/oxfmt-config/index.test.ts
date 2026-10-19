import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The project sits inside this repo so the config's import resolves @zgeoff/oxfmt-config through
// the workspace link in the root node_modules, the way a consumer's install resolves it.
async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-'));

  await writeFile(
    join(directory, 'oxfmt.config.ts'),
    "import config from '@zgeoff/oxfmt-config';\n\nexport default config;\n",
  );

  return {
    oxfmt: join(import.meta.dir, '../../node_modules/.bin/oxfmt'),
    directory,
    async [Symbol.asyncDispose]() {
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('it sorts test libraries ahead of builtins, packages and relative imports', async () => {
  await using project = await setupTest();

  await writeFile(
    join(project.directory, 'sample.test.ts'),
    [
      "import { helper } from './helper';",
      "import { render } from '@testing-library/react';",
      "import { z } from 'zod';",
      "import { join } from 'node:path';",
      "import { expect, test } from 'bun:test';",
      '',
      'export { helper, render, z, join, expect, test };',
      '',
    ].join('\n'),
  );

  const result = Bun.spawnSync([project.oxfmt, '-c', 'oxfmt.config.ts', 'sample.test.ts'], {
    cwd: project.directory,
  });

  const formatted = await readFile(join(project.directory, 'sample.test.ts'), 'utf8');

  expect(result.exitCode).toBe(0);

  expect(formatted).toBe(
    [
      "import { render } from '@testing-library/react';",
      "import { expect, test } from 'bun:test';",
      "import { join } from 'node:path';",
      "import { z } from 'zod';",
      "import { helper } from './helper';",
      '',
      'export { helper, render, z, join, expect, test };',
      '',
    ].join('\n'),
  );
});

test('it writes single quotes, semicolons and trailing commas', async () => {
  await using project = await setupTest();

  await writeFile(
    join(project.directory, 'sample.ts'),
    'export const names = [\n  "alpha",\n  "beta-with-a-long-name-that-wraps",\n  "gamma-with-another-long-name"\n]\n',
  );

  const result = Bun.spawnSync([project.oxfmt, '-c', 'oxfmt.config.ts', 'sample.ts'], {
    cwd: project.directory,
  });

  const formatted = await readFile(join(project.directory, 'sample.ts'), 'utf8');

  expect(result.exitCode).toBe(0);

  expect(formatted).toBe(
    "export const names = ['alpha', 'beta-with-a-long-name-that-wraps', 'gamma-with-another-long-name'];\n",
  );
});

test('it leaves the files repo-sync delivers unformatted', async () => {
  await using project = await setupTest();

  await mkdir(join(project.directory, 'agents'));
  await writeFile(join(project.directory, 'AGENTS.md'), '*  generated   list item\n');
  await writeFile(join(project.directory, 'agents/shared.md'), '*  shared   list item\n');

  // oxfmt applies the nearest repo's .gitignore, and this repo's ignores the project folder, so the
  // project needs its own repo for `.` to reach any file. The clean environment keeps a GIT_DIR that
  // a pre-push hook in a linked worktree exports from pointing git init at the real repository.
  Bun.spawnSync(['git', 'init', '--quiet'], {
    cwd: project.directory,
    env: { PATH: process.env['PATH'], GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });

  const result = Bun.spawnSync([project.oxfmt, '-c', 'oxfmt.config.ts', '.'], {
    cwd: project.directory,
  });

  expect(result.exitCode).toBe(0);

  const agents = await readFile(join(project.directory, 'AGENTS.md'), 'utf8');
  const shared = await readFile(join(project.directory, 'agents/shared.md'), 'utf8');

  expect(agents).toBe('*  generated   list item\n');
  expect(shared).toBe('*  shared   list item\n');
});
