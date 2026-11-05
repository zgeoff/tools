import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubSudo } from './create-stub-sudo.ts';
import { readRunFolderPrefix } from './read-run-folder-prefix.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), readRunFolderPrefix('create-stub-sudo-')));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, sudo: join(directory, 'sudo') };
}

test('#createStubSudo answers the probe sudo -n true with success and records nothing', async () => {
  const ctx = await setupTest();

  const record = join(ctx.directory, 'calls');

  await createStubSudo(ctx.directory, record);

  const result = await $`${ctx.sudo} -n true`.nothrow().quiet();

  expect({ exitCode: result.exitCode, recorded: existsSync(record) }).toStrictEqual({
    exitCode: 0,
    recorded: false,
  });
});

test('#createStubSudo records each argument of another call, marks the ones that name a file, and fails', async () => {
  const ctx = await setupTest();

  const record = join(ctx.directory, 'calls');
  const kiln = join(ctx.directory, 'kiln.env');

  await createStubSudo(ctx.directory, record);
  await writeFile(kiln, 'GLAZE=celadon\n');

  const result = await $`${ctx.sudo} systemd-run --inside ${kiln} glaze`.nothrow().quiet();
  const recorded = await readFile(record, 'utf8');

  expect({ exitCode: result.exitCode, recorded }).toStrictEqual({
    exitCode: 1,
    recorded: `text systemd-run\ntext --inside\nfile ${kiln}\ntext glaze\n`,
  });
});

test('#createStubSudo records to a path that holds a quote or a dollar sign', async () => {
  const ctx = await setupTest();

  const record = join(ctx.directory, `potter's $kiln`);

  await createStubSudo(ctx.directory, record);

  await $`${ctx.sudo} glaze`.nothrow().quiet();

  const recorded = await readFile(record, 'utf8');

  expect(recorded).toBe('text glaze\n');
});
