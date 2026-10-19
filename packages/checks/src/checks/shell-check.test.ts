import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { MissingProgramError } from '../missing-program-error.ts';
import { shellCheck } from './shell-check.ts';

// The tests run the real shellcheck and shfmt from the PATH. The runner image lacks shfmt, so
// main.yml and bun-checks.yml install it before the suite runs.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'shell-check-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it passes a clean script', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'clean.sh'), '#!/usr/bin/env bash\necho "hello"\n');

  const findings = await shellCheck.check({
    cwd: ctx.directory,
    files: ['clean.sh'],
    env: process.env,
  });

  expect(findings).toStrictEqual([]);
});

test('it reports a shellcheck problem at its line', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'unquoted.sh'), '#!/usr/bin/env bash\necho $1\n');

  const findings = await shellCheck.check({
    cwd: ctx.directory,
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
    join(ctx.directory, 'cramped.sh'),
    '#!/usr/bin/env bash\necho "start"\nif true;then echo "yes";fi\n',
  );

  const findings = await shellCheck.check({
    cwd: ctx.directory,
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

test('it reports a script that shfmt would reformat when FORCE_COLOR is set', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'cramped.sh'),
    '#!/usr/bin/env bash\necho "start"\nif true;then echo "yes";fi\n',
  );

  const findings = await shellCheck.check({
    cwd: ctx.directory,
    files: ['cramped.sh'],
    env: { ...process.env, FORCE_COLOR: '1' },
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

  await writeFile(join(ctx.directory, 'broken.sh'), '#!/usr/bin/env bash\nif true; then\n');

  const findings = await shellCheck.check({
    cwd: ctx.directory,
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

  await symlink(presentPath, join(ctx.directory, present));
  await writeFile(join(ctx.directory, 'clean.sh'), '#!/usr/bin/env bash\necho "hello"\n');

  expect(() =>
    shellCheck.check({ cwd: ctx.directory, files: ['clean.sh'], env: { PATH: ctx.directory } }),
  ).toThrowWithMessage(
    MissingProgramError,
    `shell: ${missing} is not on the PATH, and the shell check needs it. Install ${missing}, then run zgeoff-check again.`,
  );
});

test.each([
  [
    'a shellcheck problem',
    '#!/usr/bin/env bash\necho $1\n',
    2,
    'shellcheck note: Double quote to prevent globbing and word splitting. [SC2086]',
  ],
  [
    'a shfmt reformat',
    '#!/usr/bin/env bash\nif true;then echo "yes";fi\n',
    2,
    'shfmt would reformat this hunk; run shfmt -w z-last.sh to fix it',
  ],
])(
  'it reports %s in the file after the first batch of 200',
  async (_label, script, line, message) => {
    const ctx = await setupTest();

    const clean = Array.from(
      { length: 200 },
      (_, index) => `clean-${String(index).padStart(3, '0')}.sh`,
    );

    await Promise.all(
      clean.map((file) =>
        writeFile(join(ctx.directory, file), '#!/usr/bin/env bash\necho "hello"\n'),
      ),
    );

    await writeFile(join(ctx.directory, 'z-last.sh'), script);

    const findings = await shellCheck.check({
      cwd: ctx.directory,
      files: [...clean, 'z-last.sh'],
      env: process.env,
    });

    expect(findings).toStrictEqual([{ path: 'z-last.sh', line, message }]);
  },
);

test.each([
  ['the repo root', 'lib/greeting.sh', 'lib/greeting.sh'],
  ['the script folder', './greeting.sh', 'tools/greeting.sh'],
])(
  'it follows a source relative to %s into a file in another batch',
  async (_label, sourcePath, sourcedFile) => {
    const ctx = await setupTest();

    // tools/main.sh leads the first batch of 200, and the file it sources comes after every clean
    // file, so the two never share a batch.
    const clean = Array.from(
      { length: 200 },
      (_, index) => `clean-${String(index).padStart(3, '0')}.sh`,
    );

    await Promise.all(
      clean.map((file) =>
        writeFile(join(ctx.directory, file), '#!/usr/bin/env bash\necho "hello"\n'),
      ),
    );

    await Promise.all([mkdir(join(ctx.directory, 'lib')), mkdir(join(ctx.directory, 'tools'))]);

    await writeFile(
      join(ctx.directory, sourcedFile),
      '#!/usr/bin/env bash\nexport greeting="hello"\n',
    );

    await writeFile(
      join(ctx.directory, 'tools/main.sh'),
      `#!/usr/bin/env bash\nsource ${sourcePath}\necho "$greeting"\n`,
    );

    const findings = await shellCheck.check({
      cwd: ctx.directory,
      files: ['tools/main.sh', ...clean, sourcedFile],
      env: process.env,
    });

    expect(findings).toStrictEqual([]);
  },
);

test('it formats with the indentation that the repo .editorconfig sets', async () => {
  const ctx = await setupTest();

  // shfmt indents with tabs by default, so this script passes only when shfmt reads the file.
  await writeFile(
    join(ctx.directory, '.editorconfig'),
    'root = true\n\n[*.sh]\nindent_style = space\nindent_size = 2\n',
  );

  await writeFile(
    join(ctx.directory, 'spaced.sh'),
    '#!/usr/bin/env bash\nif true; then\n  echo "yes"\nfi\n',
  );

  const findings = await shellCheck.check({
    cwd: ctx.directory,
    files: ['spaced.sh'],
    env: process.env,
  });

  expect(findings).toStrictEqual([]);
});

test('it reports every hunk of every file that shfmt would reformat', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'a.sh'),
    [
      '#!/usr/bin/env bash',
      'if true;then echo "one";fi',
      'echo "2"',
      'echo "3"',
      'echo "4"',
      'echo "5"',
      'echo "6"',
      'echo "7"',
      'echo "8"',
      'echo "9"',
      'if true;then echo "ten";fi',
      '',
    ].join('\n'),
  );

  await writeFile(
    join(ctx.directory, 'b.sh'),
    '#!/usr/bin/env bash\necho "start"\nif true;then echo "yes";fi\n',
  );

  const findings = await shellCheck.check({
    cwd: ctx.directory,
    files: ['a.sh', 'b.sh'],
    env: process.env,
  });

  expect(findings).toStrictEqual([
    {
      path: 'a.sh',
      line: 2,
      message: 'shfmt would reformat this hunk; run shfmt -w a.sh to fix it',
    },
    {
      path: 'a.sh',
      line: 11,
      message: 'shfmt would reformat this hunk; run shfmt -w a.sh to fix it',
    },
    {
      path: 'b.sh',
      line: 3,
      message: 'shfmt would reformat this hunk; run shfmt -w b.sh to fix it',
    },
  ]);
});
