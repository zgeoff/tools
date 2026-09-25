import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The project sits inside this repo so the config's import resolves @zgeoff/oxfmt-config through
// the workspace link in the root node_modules, the way a consumer's install resolves it.
async function setupTest() {
  const dir = await mkdtemp(join(import.meta.dir, '.test-'));

  await writeFile(
    join(dir, 'oxfmt.config.ts'),
    "import config from '@zgeoff/oxfmt-config';\n\nexport default config;\n",
  );

  return {
    oxfmt: join(import.meta.dir, '../../node_modules/.bin/oxfmt'),
    dir,
    async [Symbol.asyncDispose]() {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test('it sorts test libraries ahead of builtins, packages and relative imports', async () => {
  await using project = await setupTest();

  await writeFile(
    join(project.dir, 'sample.test.ts'),
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
    cwd: project.dir,
  });

  const formatted = await readFile(join(project.dir, 'sample.test.ts'), 'utf8');

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
    join(project.dir, 'sample.ts'),
    'export const names = [\n  "alpha",\n  "beta-with-a-long-name-that-wraps",\n  "gamma-with-another-long-name"\n]\n',
  );

  const result = Bun.spawnSync([project.oxfmt, '-c', 'oxfmt.config.ts', 'sample.ts'], {
    cwd: project.dir,
  });

  const formatted = await readFile(join(project.dir, 'sample.ts'), 'utf8');

  expect(result.exitCode).toBe(0);

  expect(formatted).toBe(
    "export const names = ['alpha', 'beta-with-a-long-name-that-wraps', 'gamma-with-another-long-name'];\n",
  );
});

test('it leaves the files repo-sync delivers unformatted', async () => {
  await using project = await setupTest();

  await mkdir(join(project.dir, 'agents'));
  await writeFile(join(project.dir, 'AGENTS.md'), '*  generated   list item\n');
  await writeFile(join(project.dir, 'agents/shared.md'), '*  shared   list item\n');

  const result = Bun.spawnSync([project.oxfmt, '-c', 'oxfmt.config.ts', '.'], { cwd: project.dir });

  expect(result.exitCode).toBe(0);

  const agents = await readFile(join(project.dir, 'AGENTS.md'), 'utf8');
  const shared = await readFile(join(project.dir, 'agents/shared.md'), 'utf8');

  expect(agents).toBe('*  generated   list item\n');
  expect(shared).toBe('*  shared   list item\n');
});
