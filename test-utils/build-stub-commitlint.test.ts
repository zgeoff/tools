import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProgram } from '../sync/pre-push/run-program.ts';
import { buildStubCommitlint } from './build-stub-commitlint.ts';
import { readGitEnv } from './read-git-env.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'build-stub-commitlint-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const root = join(import.meta.dir, '..');

  return {
    directory,
    env: readGitEnv(directory),
    commitlint: join(root, 'node_modules/.bin/commitlint'),
    config: Bun.resolveSync('@zgeoff/commitlint-config', root),
  };
}

test('it answers each commitlint call with the next result and records its message', async () => {
  const ctx = await setupTest();

  const stub = buildStubCommitlint(ctx.commitlint, [
    { exitCode: 0, stdout: '', stderr: '' },
    { exitCode: 1, stdout: '✖   type may not be empty [type-empty]\n', stderr: '' },
  ]);

  const first = stub.runProgram([ctx.commitlint], {
    cwd: ctx.directory,
    env: ctx.env,
    stdin: 'feat: add the greeting\n',
  });

  const second = stub.runProgram([ctx.commitlint], {
    cwd: ctx.directory,
    env: ctx.env,
    stdin: 'tidy up\n',
  });

  expect([first.exitCode, second.exitCode]).toStrictEqual([0, 1]);
  expect(stub.readMessages()).toStrictEqual(['feat: add the greeting\n', 'tidy up\n']);
});

test('it throws on a commitlint call past the last result', async () => {
  const ctx = await setupTest();

  const stub = buildStubCommitlint(ctx.commitlint, []);

  expect(() =>
    stub.runProgram([ctx.commitlint], { cwd: ctx.directory, env: ctx.env, stdin: 'tidy up\n' }),
  ).toThrow('commitlint was called 1 times, past the last answer');
});

test('it runs every other program for real', async () => {
  const ctx = await setupTest();

  const stub = buildStubCommitlint(ctx.commitlint, []);

  const result = stub.runProgram(['git', 'init', '--quiet', ctx.directory], {
    cwd: ctx.directory,
    env: ctx.env,
  });

  const initialised = await Bun.file(join(ctx.directory, '.git/HEAD')).exists();

  expect(result.exitCode).toBe(0);
  expect(initialised).toBeTrue();
});

// The results that the check's tests script copy the real commitlint, so these cases pin what it
// prints and how it exits.
test('it scripts what the real commitlint prints for a clean and a broken message', async () => {
  const ctx = await setupTest();

  const lint = (message: string) =>
    runProgram([ctx.commitlint, '--config', ctx.config, '--color=false'], {
      cwd: ctx.directory,
      env: ctx.env,
      stdin: message,
    });

  const clean = lint('feat: add the greeting\n');
  const broken = lint('tidy up\n');

  expect({ exitCode: clean.exitCode, stdout: clean.stdout }).toStrictEqual({
    exitCode: 0,
    stdout: '',
  });

  expect(broken.exitCode).toBe(1);

  expect(broken.stdout).toInclude(
    '✖   subject may not be empty [subject-empty]\n✖   type may not be empty [type-empty]\n\n✖   found 2 problems, 0 warnings\n',
  );
});

test.each([
  [
    'refuses a config with no rules',
    'export default {};\n',
    9,
    { stream: 'stdout', text: 'Please add rules' },
  ],
  [
    'crashes on a config that throws',
    "throw new Error('the greeting config cannot load');\n",
    1,
    { stream: 'stderr', text: 'the greeting config cannot load' },
  ],
] as const)(
  'it scripts the exit code and error of the real commitlint when it %s',
  async (_, source, exitCode, error) => {
    const ctx = await setupTest();

    await mkdir(join(ctx.directory, 'config'));
    await writeFile(join(ctx.directory, 'config/package.json'), '{ "type": "module" }');
    await writeFile(join(ctx.directory, 'config/index.js'), source);
    await symlink(join(import.meta.dir, '../node_modules'), join(ctx.directory, 'node_modules'));

    const result = runProgram(
      [ctx.commitlint, '--config', join(ctx.directory, 'config/index.js'), '--color=false'],
      { cwd: ctx.directory, env: ctx.env, stdin: 'feat: add the greeting\n' },
    );

    expect(result.exitCode).toBe(exitCode);
    expect(result[error.stream]).toInclude(error.text);
  },
);
