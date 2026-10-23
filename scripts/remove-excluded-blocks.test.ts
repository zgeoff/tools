import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'remove-excluded-blocks-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  await mkdir(join(directory, 'skill/references'), { recursive: true });

  const scriptPath = fileURLToPath(new URL('remove-excluded-blocks.sh', import.meta.url));

  return { directory, scriptPath };
}

test('it removes a block that needs an excluded file and the blank line after it', async () => {
  const ctx = await setupTest();

  const markdown = join(ctx.directory, 'skill/SKILL.md');

  await writeFile(
    markdown,
    '# Demo\n\n' +
      '<!-- repo-sync needs ./references/rust.md -->\n\n' +
      'For Rust, read [Rust](./references/rust.md).\n\n' +
      '<!-- repo-sync end -->\n\n' +
      'Read [HTTP](./references/http.md).\n',
  );

  const result =
    await $`bash ${ctx.scriptPath} ${markdown} ${join(ctx.directory, 'skill/references/rust.md')}`
      .nothrow()
      .quiet();

  const stripped = await readFile(markdown, 'utf8');

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: '',
    stderr: '',
  });

  expect(stripped).toBe('# Demo\n\nRead [HTTP](./references/http.md).\n');
});

test('it keeps a block whose file the repo receives', async () => {
  const ctx = await setupTest();

  const markdown = join(ctx.directory, 'skill/SKILL.md');

  const content =
    '# Demo\n\n' +
    '<!-- repo-sync needs ./references/kotlin.md -->\n\n' +
    'For Kotlin, read [Kotlin](./references/kotlin.md).\n\n' +
    '<!-- repo-sync end -->\n';

  await writeFile(markdown, content);

  const result =
    await $`bash ${ctx.scriptPath} ${markdown} ${join(ctx.directory, 'skill/references/rust.md')}`
      .nothrow()
      .quiet();

  const kept = await readFile(markdown, 'utf8');

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: '',
    stderr: '',
  });

  expect(kept).toBe(content);
});

test('it fails on a block that never closes', async () => {
  const ctx = await setupTest();

  const markdown = join(ctx.directory, 'skill/SKILL.md');

  await writeFile(markdown, '<!-- repo-sync needs ./references/rust.md -->\n\nRust.\n');

  const result = await $`bash ${ctx.scriptPath} ${markdown}`.nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr: `remove-excluded-blocks: ${markdown} ends inside a block\n`,
  });
});

test('it fails on a block opened inside another block', async () => {
  const ctx = await setupTest();

  const markdown = join(ctx.directory, 'skill/SKILL.md');

  await writeFile(
    markdown,
    '<!-- repo-sync needs ./references/rust.md -->\n' +
      '<!-- repo-sync needs ./references/kotlin.md -->\n' +
      '<!-- repo-sync end -->\n',
  );

  const result = await $`bash ${ctx.scriptPath} ${markdown}`.nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr: `remove-excluded-blocks: ${markdown}:2 opens a block inside another block\n`,
  });
});
