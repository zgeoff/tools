import { expect, test } from 'bun:test';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { waitFor } from '../core/wait-for.ts';
import { createTempDir } from './create-temp-dir.ts';
import { takeTemplateLock } from './take-template-lock.ts';

function setupTest() {
  const directory = createTempDir('template-lock').path;
  const lockPath = join(directory, 'kiln.lock');

  return {
    directory,
    lockPath,

    // A lock that a dead build left: its generation folder stands, and nobody refreshes it.
    writeStaleLock: () => {
      const generationPath = join(lockPath, '1');

      const longAgo = new Date(Date.now() - 60_000);

      mkdirSync(generationPath, { recursive: true });
      utimesSync(generationPath, longAgo, longAgo);
    },
  };
}

test('it takes a lock that nobody holds', () => {
  const ctx = setupTest();
  const lock = takeTemplateLock(ctx.lockPath, 10_000);

  expect(lock).not.toBeNull();
  expect(existsSync(ctx.lockPath)).toBeTrue();
});

test('it returns null while another caller holds a fresh lock', () => {
  const ctx = setupTest();

  takeTemplateLock(ctx.lockPath, 10_000);

  expect(takeTemplateLock(ctx.lockPath, 10_000)).toBeNull();
});

test('it frees the lock on release, so the next caller can take it', () => {
  const ctx = setupTest();

  takeTemplateLock(ctx.lockPath, 10_000)?.release();
  expect(takeTemplateLock(ctx.lockPath, 10_000)).not.toBeNull();
});

test('it takes over a lock that is older than the stale limit', () => {
  const ctx = setupTest();

  ctx.writeStaleLock();

  expect(takeTemplateLock(ctx.lockPath, 10_000)).not.toBeNull();
});

test('it keeps a held lock fresh by refreshing it, so no caller takes it over', async () => {
  const ctx = setupTest();
  const startedAtMs = performance.now();

  takeTemplateLock(ctx.lockPath, 200);

  await waitFor(() => {
    if (performance.now() - startedAtMs < 500) {
      throw new Error('not yet');
    }
  });

  expect(takeTemplateLock(ctx.lockPath, 200)).toBeNull();
});

test('it leaves the lock of a new holder alone when a build that lost its lock releases', () => {
  const ctx = setupTest();

  const longAgo = new Date(Date.now() - 60_000);

  const first = takeTemplateLock(ctx.lockPath, 10_000);

  utimesSync(join(ctx.lockPath, readdirSync(ctx.lockPath)[0] ?? ''), longAgo, longAgo);
  takeTemplateLock(ctx.lockPath, 10_000);
  first?.release();
  expect(takeTemplateLock(ctx.lockPath, 10_000)).toBeNull();
});

test('it leaves a newer holder alone when a contender pauses after inspecting the stale lock', () => {
  const ctx = setupTest();

  ctx.writeStaleLock();

  const newHolders: ReturnType<typeof takeTemplateLock>[] = [];

  const paused = takeTemplateLock(ctx.lockPath, 10_000, {
    afterInspect: () => {
      newHolders.push(takeTemplateLock(ctx.lockPath, 10_000));
    },
  });

  expect(newHolders[0]).not.toBeNull();
  expect(paused).toBeNull();
  expect(takeTemplateLock(ctx.lockPath, 10_000)).toBeNull();
  newHolders[0]?.release();
  expect(takeTemplateLock(ctx.lockPath, 10_000)).not.toBeNull();
});

test('it backs off when it makes a generation after a newer holder cleared it away', () => {
  const ctx = setupTest();

  ctx.writeStaleLock();

  const holders: ReturnType<typeof takeTemplateLock>[] = [];

  // While the contender pauses, a second worker takes the lock and releases it, and a third takes
  // it after that.
  const paused = takeTemplateLock(ctx.lockPath, 10_000, {
    afterInspect: () => {
      takeTemplateLock(ctx.lockPath, 10_000)?.release();
      holders.push(takeTemplateLock(ctx.lockPath, 10_000));
    },
  });

  expect(paused).toBeNull();
  expect(holders[0]).not.toBeNull();
  expect(takeTemplateLock(ctx.lockPath, 10_000)).toBeNull();
});

test('it leaves a holder alone when a prune removes the lock folder while a contender pauses', () => {
  const ctx = setupTest();

  ctx.writeStaleLock();

  const holders: ReturnType<typeof takeTemplateLock>[] = [];

  const paused = takeTemplateLock(ctx.lockPath, 10_000, {
    afterInspect: () => {
      rmSync(ctx.lockPath, { recursive: true });

      holders.push(takeTemplateLock(ctx.lockPath, 10_000));
    },
  });

  expect(holders[0]).not.toBeNull();
  expect(paused).toBeNull();
  expect(takeTemplateLock(ctx.lockPath, 10_000)).toBeNull();
});

test('it lets only one of two contenders that both inspected the stale lock take it', () => {
  const ctx = setupTest();

  ctx.writeStaleLock();

  const seconds: ReturnType<typeof takeTemplateLock>[] = [];

  const first = takeTemplateLock(ctx.lockPath, 10_000, {
    afterInspect: () => {
      seconds.push(takeTemplateLock(ctx.lockPath, 10_000));
    },
  });

  expect([first, ...seconds].filter((lock) => lock !== null)).toHaveLength(1);
});

test('it lets exactly one of several processes take over one stale lock', async () => {
  const ctx = setupTest();

  const longAgo = new Date(Date.now() - 60_000);

  const scriptPath = join(ctx.directory, 'contender.ts');
  const lockModule = join(import.meta.dir, 'take-template-lock.ts');

  mkdirSync(ctx.lockPath);
  utimesSync(ctx.lockPath, longAgo, longAgo);

  await Bun.write(
    scriptPath,
    `import { takeTemplateLock } from ${JSON.stringify(lockModule)};
console.log(takeTemplateLock(${JSON.stringify(ctx.lockPath)}, 10_000) === null ? 'none' : 'took');`,
  );

  const contenders = Array.from({ length: 6 }, () =>
    Bun.spawn(['bun', scriptPath], { stdout: 'pipe', stderr: 'ignore' }),
  );

  const outputs = await Promise.all(
    contenders.map((contender) => new Response(contender.stdout).text()),
  );

  const winners = outputs.filter((output) => output.trim() === 'took');

  expect(winners).toHaveLength(1);
});

test('it returns null when a pruner moves the lock folder away while it takes the lock', () => {
  const ctx = setupTest();

  const lock = takeTemplateLock(ctx.lockPath, 10_000, {
    afterInspect: () => {
      renameSync(ctx.lockPath, `${ctx.lockPath}-set-aside`);
    },
  });

  expect(lock).toBeNull();
});
