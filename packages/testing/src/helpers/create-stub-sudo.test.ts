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

  const record = join(directory, 'calls');

  await createStubSudo(directory, record);

  return { directory, record, sudo: join(directory, 'sudo') };
}

test('#createStubSudo answers the probe sudo -n true with success and records nothing', async () => {
  const ctx = await setupTest();
  const result = await $`${ctx.sudo} -n true`.nothrow().quiet();

  expect({ exitCode: result.exitCode, recorded: existsSync(ctx.record) }).toStrictEqual({
    exitCode: 0,
    recorded: false,
  });
});

test('#createStubSudo records each argument of another call, marks the ones that name a file, and fails', async () => {
  const ctx = await setupTest();

  const kiln = join(ctx.directory, 'kiln.env');

  await writeFile(kiln, 'GLAZE=celadon\n');

  const result = await $`${ctx.sudo} systemd-run --inside ${kiln} glaze`.nothrow().quiet();
  const recorded = await readFile(ctx.record, 'utf8');

  expect({ exitCode: result.exitCode, recorded }).toStrictEqual({
    exitCode: 1,
    recorded: `text systemd-run\ntext --inside\nfile ${kiln}\ntext glaze\n`,
  });
});
