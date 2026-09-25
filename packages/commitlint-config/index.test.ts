import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The project sits inside this repo so `extends` resolves @zgeoff/commitlint-config through the
// workspace link in the root node_modules, the way a consumer's install resolves it.
async function setupTest() {
  const dir = await mkdtemp(join(import.meta.dir, '.test-'));

  await writeFile(
    join(dir, 'commitlint.config.js'),
    "export default { extends: ['@zgeoff/commitlint-config'] };\n",
  );

  return {
    commitlint: join(import.meta.dir, 'node_modules/.bin/commitlint'),
    dir,
    async [Symbol.asyncDispose]() {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test('it accepts a conventional header with a lower-case scope and subject', async () => {
  await using project = await setupTest();

  const result = Bun.spawnSync([project.commitlint, '--cwd', project.dir], {
    stdin: Buffer.from('feat(tsconfig): add the react variant\n'),
  });

  expect(result.exitCode).toBe(0);
});

test('it rejects a type outside the allowed list', async () => {
  await using project = await setupTest();

  const result = Bun.spawnSync([project.commitlint, '--cwd', project.dir], {
    stdin: Buffer.from('wip: add the react variant\n'),
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout.toString()).toInclude('[type-enum]');
});

test('it rejects a subject with an upper-case word', async () => {
  await using project = await setupTest();

  const result = Bun.spawnSync([project.commitlint, '--cwd', project.dir], {
    stdin: Buffer.from('chore: inherit the shared CodeRabbit config\n'),
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout.toString()).toInclude('[subject-case]');
});

test('it rejects a header longer than 72 characters', async () => {
  await using project = await setupTest();

  const result = Bun.spawnSync([project.commitlint, '--cwd', project.dir], {
    stdin: Buffer.from(`fix: ${'a'.repeat(68)}\n`),
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout.toString()).toInclude('[header-max-length]');
});

test('it rejects a body that starts on the line after the header', async () => {
  await using project = await setupTest();

  const result = Bun.spawnSync([project.commitlint, '--cwd', project.dir], {
    stdin: Buffer.from('fix: keep the lockfile in sync\nthe body starts here\n'),
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout.toString()).toInclude('[body-leading-blank]');
});
