import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, mkdirSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

    removeStale: (afterSetAside?: () => void) => {
      removeStaleTemplates(root, {
        nowMs,
        maxUnusedMs: 24 * hourMs,
        staleLockMs: 120_000,
        ...(afterSetAside === undefined ? {} : { afterSetAside }),
      });
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

test('it removes a template of any name that nothing has used for longer than the limit, with its marker and lock', () => {
  const ctx = setupTest();

  ctx.writeUsedTemplate('blog-0123456789abcdef', 25 * ctx.hourMs);
  ctx.removeStale();

  expect(readdirSync(ctx.root)).toStrictEqual([]);
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

  expect(readdirSync(ctx.root)).toStrictEqual([]);
});

test('it puts a template back when a reader marks it while the prune has it set aside', () => {
  const ctx = setupTest();

  ctx.writeUsedTemplate('blog-0123456789abcdef', 25 * ctx.hourMs);

  ctx.removeStale(() => {
    writeFileSync(join(ctx.root, 'blog-0123456789abcdef.used'), '');
  });

  expect(readdirSync(ctx.root).toSorted()).toStrictEqual([
    'blog-0123456789abcdef',
    'blog-0123456789abcdef.lock',
    'blog-0123456789abcdef.used',
  ]);
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

  expect(readdirSync(ctx.root).toSorted()).toStrictEqual([
    'docs-aaaaaaaaaaaaaaaa',
    'docs-aaaaaaaaaaaaaaaa.lock',
    'docs-aaaaaaaaaaaaaaaa.used',
    'wiki-bbbbbbbbbbbbbbbb',
    'wiki-bbbbbbbbbbbbbbbb.lock',
    'wiki-bbbbbbbbbbbbbbbb.used',
  ]);
});
