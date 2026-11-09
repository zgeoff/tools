import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'remove-excluded-blocks-stub-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const scriptPath = fileURLToPath(new URL('remove-excluded-blocks.sh', import.meta.url));

  return { directory, scriptPath };
}

test('it strips a block when a run from another folder calls the path outside src/', async () => {
  const ctx = await setupTest();

  const markdown = join(ctx.directory, 'SKILL.md');

  await writeFile(
    markdown,
    '# Kettle\n\n' +
      '<!-- repo-sync needs ./references/steam.md -->\n\n' +
      'Read [Steam](./references/steam.md).\n\n' +
      '<!-- repo-sync end -->\n\n' +
      'Read [Spout](./references/spout.md).\n',
  );

  const result = await $`bash ${ctx.scriptPath} SKILL.md references/steam.md`
    .cwd(ctx.directory)
    .nothrow()
    .quiet();

  const stripped = await readFile(markdown, 'utf8');

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({ exitCode: 0, stdout: '', stderr: '' });

  expect(stripped).toBe('# Kettle\n\nRead [Spout](./references/spout.md).\n');
});
