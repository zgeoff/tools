import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, mkdirSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { waitFor } from '../core/wait-for.ts';
import { createTempDir } from './create-temp-dir.ts';
import { removeStaleTemplates } from './remove-stale-templates.ts';
import { takeTemplateLock } from './take-template-lock.ts';

function setupTest() {
  const root = createTempDir('stale-templates').path;
  const nowMs = Date.now();
  const hourMs = 60 * 60 * 1000;

  const backdate = (path: string, ageMs: number) => {
    const touched = new Date(nowMs - ageMs);

    utimesSync(path, touched, touched);
  };

  return {
    root,
    nowMs,
    hourMs,
    backdate,

    // Writes a template that a call marked as used ageMs ago, with the lock its build released.
    writeUsedTemplate: (folder: string, ageMs: number) => {
      mkdirSync(join(root, folder, 'site'), { recursive: true });
      writeFileSync(join(root, folder, 'site', 'index.html'), 'site\n');
      mkdirSync(join(root, `${folder}.lock`, '1'), { recursive: true });
      writeFileSync(join(root, `${folder}.lock`, '1', 'released'), '');
      writeFileSync(join(root, `${folder}.used`), '');

      for (const path of [folder, `${folder}.lock`, `${folder}.lock/1`, `${folder}.used`]) {
        backdate(join(root, path), ageMs);
      }
    },

    removeStale: (staleLockMs = 120_000) => {
      removeStaleTemplates(root, { nowMs, maxUnusedMs: 24 * hourMs, staleLockMs });
    },

    // Runs the prune in a process of its own, as a test worker does.
    runPruneProcess: () =>
      Bun.spawn(
        [
          process.execPath,
          '-e',
          `import { removeStaleTemplates } from ${JSON.stringify(join(import.meta.dir, 'remove-stale-templates.ts'))};
removeStaleTemplates(process.env.PRUNE_ROOT, {
  nowMs: Date.now(),
  maxUnusedMs: 24 * 60 * 60 * 1000,
  staleLockMs: 120000,
});`,
        ],
        { env: { ...process.env, PRUNE_ROOT: root }, stdout: 'pipe', stderr: 'pipe' },
      ),
  };
}

test('it removes a template of any name that nothing has used for longer than the limit, with its marker', () => {
  const ctx = setupTest();

  ctx.writeUsedTemplate('blog-0123456789abcdef', 25 * ctx.hourMs);
  ctx.removeStale();

  expect(readdirSync(ctx.root)).toStrictEqual(['blog-0123456789abcdef.lock']);
});

test('it removes the lock folder in a later prune, once the lock has gone unused for the limit too', () => {
  const ctx = setupTest();

  ctx.writeUsedTemplate('blog-0123456789abcdef', 25 * ctx.hourMs);
  ctx.removeStale();

  const afterFirst = readdirSync(ctx.root);
  const lockFolder = join(ctx.root, 'blog-0123456789abcdef.lock');

  for (const generation of readdirSync(lockFolder)) {
    ctx.backdate(join(lockFolder, generation), 25 * ctx.hourMs);
  }

  ctx.backdate(lockFolder, 25 * ctx.hourMs);
  ctx.removeStale();

  expect({ afterFirst, afterSecond: readdirSync(ctx.root) }).toStrictEqual({
    afterFirst: ['blog-0123456789abcdef.lock'],
    afterSecond: [],
  });
});

test('it leaves no timer that keeps refreshing the lock after it removes a template', async () => {
  const ctx = setupTest();

  ctx.writeUsedTemplate('blog-0123456789abcdef', 25 * ctx.hourMs);
  ctx.removeStale(80);

  const generations = join(ctx.root, 'blog-0123456789abcdef.lock');
  const newest = Math.max(...readdirSync(generations).map(Number));
  const generation = join(generations, String(newest));

  ctx.backdate(generation, 60_000);

  const startedAtMs = performance.now();

  await waitFor(
    () => {
      if (performance.now() - startedAtMs < 130) {
        throw new Error('not yet');
      }
    },
    { intervalMs: 10, timeoutMs: 5000 },
  );

  expect(ctx.nowMs - statSync(generation).mtimeMs).toBeGreaterThan(50_000);
});

test('it keeps a template that a call used within the limit', () => {
  const ctx = setupTest();

  ctx.writeUsedTemplate('blog-0123456789abcdef', 23 * ctx.hourMs);
  ctx.removeStale();

  expect(readdirSync(ctx.root).toSorted()).toStrictEqual([
    'blog-0123456789abcdef',
    'blog-0123456789abcdef.lock',
    'blog-0123456789abcdef.used',
  ]);
});

test('it keeps a stale template whose lock another caller holds', () => {
  const ctx = setupTest();

  ctx.writeUsedTemplate('blog-0123456789abcdef', 25 * ctx.hourMs);

  const lock = takeTemplateLock(join(ctx.root, 'blog-0123456789abcdef.lock'), 120_000);

  onTestFinished(() => lock?.release());

  ctx.removeStale();

  expect(existsSync(join(ctx.root, 'blog-0123456789abcdef'))).toBeTrue();
});

test('it removes a lock folder that a dead build left with no template', () => {
  const ctx = setupTest();

  mkdirSync(join(ctx.root, 'blog-0123456789abcdef.lock', '1'), { recursive: true });

  ctx.backdate(join(ctx.root, 'blog-0123456789abcdef.lock', '1'), 25 * ctx.hourMs);
  ctx.backdate(join(ctx.root, 'blog-0123456789abcdef.lock'), 25 * ctx.hourMs);
  ctx.removeStale();

  expect(readdirSync(ctx.root)).toStrictEqual([]);
});

test('it removes the staging folder of a dead build beside a stale template', () => {
  const ctx = setupTest();

  ctx.writeUsedTemplate('blog-0123456789abcdef', 25 * ctx.hourMs);

  mkdirSync(join(ctx.root, 'blog-0123456789abcdef.staging-4242-x'));

  ctx.backdate(join(ctx.root, 'blog-0123456789abcdef.staging-4242-x'), 25 * ctx.hourMs);
  ctx.removeStale();

  expect(readdirSync(ctx.root)).toStrictEqual(['blog-0123456789abcdef.lock']);
});

test('it lets two processes prune the same cache at once, and each keeps the fresh and locked templates', async () => {
  const ctx = setupTest();

  const staleFolders = Array.from(
    { length: 150 },
    (_, index) => `blog-${index.toString(16).padStart(16, '0')}`,
  );

  for (const folder of staleFolders) {
    ctx.writeUsedTemplate(folder, 25 * ctx.hourMs);
  }

  ctx.writeUsedTemplate('docs-aaaaaaaaaaaaaaaa', ctx.hourMs);
  ctx.writeUsedTemplate('wiki-bbbbbbbbbbbbbbbb', 25 * ctx.hourMs);

  const lock = takeTemplateLock(join(ctx.root, 'wiki-bbbbbbbbbbbbbbbb.lock'), 120_000);

  onTestFinished(() => lock?.release());

  const pruners = [ctx.runPruneProcess(), ctx.runPruneProcess()];

  const results = await Promise.all(
    pruners.map(async (pruner) => ({
      exitCode: await pruner.exited,
      stderr: await new Response(pruner.stderr).text(),
    })),
  );

  expect(results).toStrictEqual([
    { exitCode: 0, stderr: '' },
    { exitCode: 0, stderr: '' },
  ]);

  expect(
    readdirSync(ctx.root)
      .filter((entry) => !entry.startsWith('blog-'))
      .toSorted(),
  ).toStrictEqual([
    'docs-aaaaaaaaaaaaaaaa',
    'docs-aaaaaaaaaaaaaaaa.lock',
    'docs-aaaaaaaaaaaaaaaa.used',
    'wiki-bbbbbbbbbbbbbbbb',
    'wiki-bbbbbbbbbbbbbbbb.lock',
    'wiki-bbbbbbbbbbbbbbbb.used',
  ]);
});
