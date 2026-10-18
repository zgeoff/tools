import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { MissingProgramError } from '../missing-program-error.ts';
import { shellCheck } from './shell-check.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'shell-check-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it passes a clean script', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'clean.sh'), '#!/usr/bin/env bash\necho "hello"\n');

  const findings = await shellCheck.check({
    cwd: ctx.dir,
    files: ['clean.sh'],
    env: process.env,
  });

  expect(findings).toStrictEqual([]);
});

test('it reports a shellcheck problem at its line', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'unquoted.sh'), '#!/usr/bin/env bash\necho $1\n');

  const findings = await shellCheck.check({
    cwd: ctx.dir,
    files: ['unquoted.sh'],
    env: process.env,
  });

  expect(findings).toStrictEqual([
    {
      path: 'unquoted.sh',
      line: 2,
      message: 'shellcheck note: Double quote to prevent globbing and word splitting. [SC2086]',
    },
  ]);
});

test('it reports a script that shfmt would reformat at the first changed line', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'cramped.sh'),
    '#!/usr/bin/env bash\necho "start"\nif true;then echo "yes";fi\n',
  );

  const findings = await shellCheck.check({
    cwd: ctx.dir,
    files: ['cramped.sh'],
    env: process.env,
  });

  expect(findings).toStrictEqual([
    {
      path: 'cramped.sh',
      line: 3,
      message: 'shfmt would reformat this hunk; run shfmt -w cramped.sh to fix it',
    },
  ]);
});

test('it reports a script that shfmt cannot parse', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'broken.sh'), '#!/usr/bin/env bash\nif true; then\n');

  const findings = await shellCheck.check({
    cwd: ctx.dir,
    files: ['broken.sh'],
    env: process.env,
  });

  expect(findings).toPartiallyContain({
    path: 'broken.sh',
    message: expect.toStartWith('shfmt cannot parse the file: '),
  });
});

test.each([
  ['shellcheck', 'shfmt'],
  ['shfmt', 'shellcheck'],
])('it names %s when the PATH holds only %s', async (missing, present) => {
  const ctx = await setupTest();

  const presentPath = Bun.which(present);

  invariant(presentPath !== null, `${present} must be on the PATH to run this test`);

  await symlink(presentPath, join(ctx.dir, present));
  await writeFile(join(ctx.dir, 'clean.sh'), '#!/usr/bin/env bash\necho "hello"\n');

  expect(() =>
    shellCheck.check({ cwd: ctx.dir, files: ['clean.sh'], env: { PATH: ctx.dir } }),
  ).toThrowWithMessage(
    MissingProgramError,
    `shell: ${missing} is not on the PATH, and the shell check needs it. Install ${missing}, then run zgeoff-check again.`,
  );
});
