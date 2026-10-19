import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubCurl } from './create-stub-curl.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'create-stub-curl-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it writes the body to the -o path of a download', async () => {
  const ctx = await setupTest();

  await createStubCurl(ctx.directory, 'fake shfmt\n');

  await $`${join(ctx.directory, 'curl')} -fsSL -o ${join(ctx.directory, 'out')} https://example.com/shfmt`.quiet();

  const body = await readFile(join(ctx.directory, 'out'), 'utf8');

  expect(body).toBe('fake shfmt\n');
});

test.each([
  ['a download with no -o', ['-fsSL', 'https://example.com/shfmt']],
  ['a download with other flags', ['-sL', '-o', 'out', 'https://example.com/shfmt']],
  ['a download with an extra argument', ['-fsSL', '-o', 'out', 'https://example.com/a', 'b']],
])('it exits 64 and writes nothing for %s', async (_label, args) => {
  const ctx = await setupTest();

  await createStubCurl(ctx.directory, 'fake shfmt\n');

  const result = await $`${join(ctx.directory, 'curl')} ${args}`
    .cwd(ctx.directory)
    .nothrow()
    .quiet();

  const wrote = await Bun.file(join(ctx.directory, 'out')).exists();

  expect(result.exitCode).toBe(64);
  expect(result.stderr.toString()).toBe('stub curl: supports only: curl -fsSL -o <path> <url>\n');
  expect(wrote).toBeFalse();
});
