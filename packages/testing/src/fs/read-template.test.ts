import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { removeEnvOverrides } from '../core/remove-env-overrides.ts';
import { updateEnv } from '../core/update-env.ts';
import { waitFor } from '../core/wait-for.ts';
import { createTempDir } from './create-temp-dir.ts';
import { readTemplate } from './read-template.ts';
import { takeTemplateLock } from './take-template-lock.ts';
import { writeTreeFiles } from './write-tree-files.ts';

// Points the OS temp folder at a folder of this test, so each test has a template cache of its own.
async function setupTest() {
  const tempFolder = createTempDir('template-cache').path;
  const root = createTempDir('template-inputs').path;

  onTestFinished(removeEnvOverrides);
  updateEnv('TMPDIR', tempFolder);

  await writeTreeFiles(root, { 'src/app.ts': 'export {};\n', 'package.json': '{}\n' });

  const builds: string[] = [];

  return {
    root,
    templatesRoot: join(tempFolder, 'zgeoff-testing-templates'),
    builds,

    // Builds a one-file site, and notes the folder it built into.
    writeSite: async (directory: string) => {
      builds.push(directory);

      await writeTreeFiles(directory, { 'index.html': 'site\n' });
    },

    // Resolves once the time has passed, polling the clock so that no fixed sleep runs.
    waitUntilElapsed: (elapsedMs: number) => {
      const startedAtMs = performance.now();

      return waitFor(
        () => {
          if (performance.now() - startedAtMs < elapsedMs) {
            throw new Error('not yet');
          }
        },
        { intervalMs: 10, timeoutMs: elapsedMs + 5000 },
      );
    },
    hourMs: 60 * 60 * 1000,
    buildOptions: (name = 'built-site') => ({
      name,
      root,
      inputs: ['src/**', 'package.json'],
    }),
  };
}

test('it builds the template into an empty folder under one folder of the OS temp folder', async () => {
  const ctx = await setupTest();

  const emptyBefore: boolean[] = [];

  const template = await readTemplate({
    ...ctx.buildOptions(),
    write: async (directory) => {
      emptyBefore.push(readdirSync(directory).length === 0);

      await writeTreeFiles(directory, { 'index.html': '<h1>site</h1>\n' });
    },
  });

  expect({
    emptyBefore,
    parent: join(template, '..'),
    name: template.slice(ctx.templatesRoot.length + 1),
    content: readFileSync(join(template, 'index.html'), 'utf8'),
  }).toStrictEqual({
    emptyBefore: [true],
    parent: ctx.templatesRoot,
    name: expect.stringMatching(/^built-site-[0-9a-f]{16}$/u),
    content: '<h1>site</h1>\n',
  });
});

test('it uses the template again with no build while the name and the input files stay the same', async () => {
  const ctx = await setupTest();
  const first = await readTemplate({ ...ctx.buildOptions(), write: ctx.writeSite });
  const second = await readTemplate({ ...ctx.buildOptions(), write: ctx.writeSite });

  expect({ same: first === second, builds: ctx.builds.length }).toStrictEqual({
    same: true,
    builds: 1,
  });
});

test('it builds again when the content of an input file changes', async () => {
  const ctx = await setupTest();
  const first = await readTemplate({ ...ctx.buildOptions(), write: ctx.writeSite });

  await writeTreeFiles(ctx.root, { 'src/app.ts': 'export const port = 4310;\n' });

  const second = await readTemplate({ ...ctx.buildOptions(), write: ctx.writeSite });

  expect({ same: first === second, builds: ctx.builds.length }).toStrictEqual({
    same: false,
    builds: 2,
  });
});

test('it builds again when an input file moves, with its content unchanged', async () => {
  const ctx = await setupTest();

  await readTemplate({ ...ctx.buildOptions(), write: ctx.writeSite });
  await writeTreeFiles(ctx.root, { 'src/app.ts': null, 'src/main.ts': 'export {};\n' });
  await readTemplate({ ...ctx.buildOptions(), write: ctx.writeSite });

  expect(ctx.builds).toHaveLength(2);
});

test('it builds again for another name over the same inputs', async () => {
  const ctx = await setupTest();

  await readTemplate({ ...ctx.buildOptions('built-site'), write: ctx.writeSite });
  await readTemplate({ ...ctx.buildOptions('built-docs'), write: ctx.writeSite });

  expect(ctx.builds).toHaveLength(2);
});

test('it ignores a file that no input names', async () => {
  const ctx = await setupTest();

  await readTemplate({ ...ctx.buildOptions(), write: ctx.writeSite });
  await writeTreeFiles(ctx.root, { 'notes/todo.md': 'nothing to do\n' });
  await readTemplate({ ...ctx.buildOptions(), write: ctx.writeSite });

  expect(ctx.builds).toHaveLength(1);
});

test('it builds once, however many callers ask at the same time', async () => {
  const ctx = await setupTest();

  const templates = await Promise.all(
    Array.from({ length: 6 }, () =>
      readTemplate({
        ...ctx.buildOptions(),
        write: async (directory) => {
          ctx.builds.push(directory);

          await ctx.waitUntilElapsed(100);

          await writeTreeFiles(directory, { 'index.html': 'site\n' });
        },
      }),
    ),
  );

  expect({ builds: ctx.builds.length, paths: new Set(templates).size }).toStrictEqual({
    builds: 1,
    paths: 1,
  });
});

test('it builds into a staging folder, and no caller sees the template before the build ends', async () => {
  const ctx = await setupTest();

  const sawTemplate: boolean[] = [];

  await readTemplate({
    ...ctx.buildOptions(),
    write: async (directory) => {
      await writeTreeFiles(directory, { 'index.html': 'site\n' });

      sawTemplate.push(
        readdirSync(ctx.templatesRoot).some((entry) => /^built-site-[0-9a-f]{16}$/u.test(entry)),
      );
    },
  });

  expect(sawTemplate).toStrictEqual([false]);
});

test('it removes the staging folder, releases the lock and rethrows when write throws', async () => {
  const ctx = await setupTest();

  const failure = readTemplate({
    ...ctx.buildOptions(),
    write: async (directory) => {
      await writeTreeFiles(directory, { 'half.html': 'half\n' });

      throw new Error('the build broke');
    },
  });

  await expect(failure).rejects.toThrow('the build broke');

  const lockFolder = readdirSync(ctx.templatesRoot).find((entry) => entry.endsWith('.lock'));

  expect(readdirSync(ctx.templatesRoot).filter((entry) => entry !== lockFolder)).toStrictEqual([]);

  const lockPath = join(ctx.templatesRoot, String(lockFolder));

  expect(takeTemplateLock(lockPath, 10_000)).not.toBeNull();
});

test('it lets a caller that waits take the lock and build when the first build fails', async () => {
  const ctx = await setupTest();

  const firstBuilding = Promise.withResolvers<void>();

  const first = readTemplate({
    ...ctx.buildOptions(),
    write: async () => {
      firstBuilding.resolve();

      await ctx.waitUntilElapsed(100);

      throw new Error('the build broke');
    },
  });

  // The second caller starts once the first holds the lock, so it is the one that waits.
  await firstBuilding.promise;

  const second = readTemplate({
    ...ctx.buildOptions(),
    write: async (directory) => {
      ctx.builds.push(directory);

      await writeTreeFiles(directory, { 'index.html': 'site\n' });
    },
  });

  const [firstResult, secondResult] = await Promise.allSettled([first, second]);

  expect({
    first: firstResult.status,
    second: secondResult.status,
    builds: ctx.builds.length,
  }).toStrictEqual({
    first: 'rejected',
    second: 'fulfilled',
    builds: 1,
  });
});

test('it takes over a lock that a dead build left, and builds from the start', async () => {
  const ctx = await setupTest();
  const template = await readTemplate({ ...ctx.buildOptions(), write: ctx.writeSite });

  const longAgo = new Date(Date.now() - 60_000);

  // The dead build: its lock stands, and its template never came to be.
  const lockPath = `${template}.lock`;

  Bun.spawnSync(['rm', '-rf', template]);

  mkdirSync(join(lockPath, '1'), { recursive: true });
  utimesSync(join(lockPath, '1'), longAgo, longAgo);

  await readTemplate({ ...ctx.buildOptions(), write: ctx.writeSite, staleLockMs: 1000 });

  expect(ctx.builds).toHaveLength(2);
});

test('it waits for a slow build that refreshes its lock, and never takes the lock over', async () => {
  const ctx = await setupTest();

  const results = await Promise.all(
    [0, 1].map(() =>
      readTemplate({
        ...ctx.buildOptions(),
        staleLockMs: 200,
        write: async (directory) => {
          ctx.builds.push(directory);

          await ctx.waitUntilElapsed(700);

          await writeTreeFiles(directory, { 'index.html': 'site\n' });
        },
      }),
    ),
  );

  expect({ builds: ctx.builds.length, paths: new Set(results).size }).toStrictEqual({
    builds: 1,
    paths: 1,
  });
});

test('it marks the template as used on each call', async () => {
  const ctx = await setupTest();
  const template = await readTemplate({ ...ctx.buildOptions(), write: ctx.writeSite });

  const longAgo = new Date(Date.now() - 3 * ctx.hourMs);

  utimesSync(`${template}.used`, longAgo, longAgo);

  await readTemplate({ ...ctx.buildOptions(), write: ctx.writeSite });

  expect(Date.now() - statSync(`${template}.used`).mtimeMs).toBeLessThan(60_000);
});

test('it deletes a template of the same name that no call has used for an hour, after a build', async () => {
  const ctx = await setupTest();
  const old = await readTemplate({ ...ctx.buildOptions(), write: ctx.writeSite });

  const longAgo = new Date(Date.now() - 3 * ctx.hourMs);

  utimesSync(`${old}.used`, longAgo, longAgo);

  await writeTreeFiles(ctx.root, { 'src/app.ts': 'export const changed = true;\n' });

  const fresh = await readTemplate({ ...ctx.buildOptions(), write: ctx.writeSite });

  expect({ oldExists: existsSync(old), freshExists: existsSync(fresh) }).toStrictEqual({
    oldExists: false,
    freshExists: true,
  });
});

test('it keeps a template of the same name that a call used within the hour, after a build', async () => {
  const ctx = await setupTest();
  const recent = await readTemplate({ ...ctx.buildOptions(), write: ctx.writeSite });

  await writeTreeFiles(ctx.root, { 'src/app.ts': 'export const changed = true;\n' });
  await readTemplate({ ...ctx.buildOptions(), write: ctx.writeSite });

  expect(existsSync(recent)).toBeTrue();
});
