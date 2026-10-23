import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { $ } from 'bun';
import { runProgram } from './run-program.ts';
import { runTestTimeoutsCheck } from './run-test-timeouts-check.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'run-test-timeouts-check-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = {
    PATH: process.env['PATH'],
    HOME: directory,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test Author',
    GIT_AUTHOR_EMAIL: 'author@example.com',
    GIT_COMMITTER_NAME: 'Test Author',
    GIT_COMMITTER_EMAIL: 'author@example.com',
  };

  await $`git init --quiet`.cwd(directory).env(env);

  return { directory, env };
}

test('it passes a repo whose scripts and bunfig keep the default timeout', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { test: 'bun test --timeout=5000' } }),
  );

  await writeFile(join(ctx.directory, 'bunfig.toml'), '[test]\npreload = ["./preload.ts"]\n');

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runTestTimeoutsCheck({ cwd: ctx.directory, env: ctx.env, runProgram });

  expect(findings).toStrictEqual([]);
});

test('it reports each bun test timeout above 5 s in a package script, in both flag forms', async () => {
  const ctx = await setupTest();

  await mkdir(dirname(join(ctx.directory, 'packages/kettle/package.json')), { recursive: true });

  await writeFile(
    join(ctx.directory, 'packages/kettle/package.json'),
    JSON.stringify({
      scripts: {
        test: 'bun run build && bun test --timeout 20000 src',
        'test:slow': 'bun test --timeout=30_000 slow',
      },
    }),
  );

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runTestTimeoutsCheck({ cwd: ctx.directory, env: ctx.env, runProgram });

  expect(findings).toStrictEqual([
    {
      path: 'packages/kettle/package.json',
      message:
        'script "test" passes --timeout=20000 to bun test, above the 5 s limit; only test:related and a lane script (test:<lane>, for e2e, browser, docker, host and each lane in the max-test-timeout lanes option) may raise it',
    },
    {
      path: 'packages/kettle/package.json',
      message:
        'script "test:slow" passes --timeout=30000 to bun test, above the 5 s limit; only test:related and a lane script (test:<lane>, for e2e, browser, docker, host and each lane in the max-test-timeout lanes option) may raise it',
    },
  ]);
});

test('it leaves a --timeout of a command other than bun test alone', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({
      scripts: { test: 'wait-on --timeout 60000 tcp:3000 && bun test' },
    }),
  );

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runTestTimeoutsCheck({ cwd: ctx.directory, env: ctx.env, runProgram });

  expect(findings).toStrictEqual([]);
});

test('it reports a bun test that a wrapper script runs', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({
      scripts: { 'test:daemon': 'bash scripts/with-home.sh bun test --timeout 20000 e2e' },
    }),
  );

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runTestTimeoutsCheck({ cwd: ctx.directory, env: ctx.env, runProgram });

  expect(findings).toStrictEqual([
    {
      path: 'package.json',
      message:
        'script "test:daemon" passes --timeout=20000 to bun test, above the 5 s limit; only test:related and a lane script (test:<lane>, for e2e, browser, docker, host and each lane in the max-test-timeout lanes option) may raise it',
    },
  ]);
});

test.each([
  ['a quoted name pattern', 'bun test --test-name-pattern "--timeout=30000"'],
  ['an echo of the command', 'echo "bun test --timeout=30000"'],
  ['an unquoted echo of the command', 'echo bun test --timeout=30000 && bun test'],
  ['a printf of the command', "CI=1 printf '%s' bun test --timeout=30000"],
  ['a double-quoted echo of the command', '"echo" bun test --timeout=30000 && bun test'],
  ['a single-quoted echo of the command', "'echo' bun test --timeout=30000 && bun test"],
  ['a single-quoted printf of the command', "'printf' '%s' bun test --timeout=30000"],
  ['an escaped flag', String.raw`bun test \--timeout=30000`],
])('it leaves %s alone', async (_, command) => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { test: command } }),
  );

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runTestTimeoutsCheck({ cwd: ctx.directory, env: ctx.env, runProgram });

  expect(findings).toStrictEqual([]);
});

test('it reports a bun test whose command words are quoted', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { test: `"bun" 'test' --timeout=30000` } }),
  );

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runTestTimeoutsCheck({ cwd: ctx.directory, env: ctx.env, runProgram });

  expect(findings).toStrictEqual([
    {
      path: 'package.json',
      message:
        'script "test" passes --timeout=30000 to bun test, above the 5 s limit; only test:related and a lane script (test:<lane>, for e2e, browser, docker, host and each lane in the max-test-timeout lanes option) may raise it',
    },
  ]);
});

test('it exempts test:related and the built-in lane scripts', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({
      scripts: {
        'test:related': 'bun test --timeout=15000',
        'test:e2e': 'bun test --timeout=60000 e2e',
        'test:browser': 'bun test --timeout=20000 .browser.test.ts',
        'test:docker': 'bun test --timeout=20000 .docker.test.ts',
        'test:host': 'bun test --timeout=20000 .host.test.ts',
      },
    }),
  );

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runTestTimeoutsCheck({ cwd: ctx.directory, env: ctx.env, runProgram });

  expect(findings).toStrictEqual([]);
});

test('it exempts the script of a lane that the max-test-timeout lanes option declares', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, '.oxlintrc.json'),
    '{\n  // the binary suites run against a built daemon\n  "rules": { "zgeoff/max-test-timeout": ["error", { "lanes": ["binary"] }] },\n}\n',
  );

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({
      scripts: { 'test:binary': 'bun test --timeout 20000 e2e/daemon-*.test.ts' },
    }),
  );

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runTestTimeoutsCheck({ cwd: ctx.directory, env: ctx.env, runProgram });

  expect(findings).toStrictEqual([]);
});

test('it reports a lane script that the lanes option does not declare', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, '.oxlintrc.json'),
    '{ "rules": { "zgeoff/max-test-timeout": "error" } }\n',
  );

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({
      scripts: { 'test:binary': 'bun test --timeout 20000 e2e/daemon-*.test.ts' },
    }),
  );

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runTestTimeoutsCheck({ cwd: ctx.directory, env: ctx.env, runProgram });

  expect(findings).toStrictEqual([
    {
      path: 'package.json',
      message:
        'script "test:binary" passes --timeout=20000 to bun test, above the 5 s limit; only test:related and a lane script (test:<lane>, for e2e, browser, docker, host and each lane in the max-test-timeout lanes option) may raise it',
    },
  ]);
});

test('it reports a bunfig.toml whose test timeout is above 5 s', async () => {
  const ctx = await setupTest();

  await mkdir(dirname(join(ctx.directory, 'libs/db/bunfig.toml')), { recursive: true });
  await writeFile(join(ctx.directory, 'libs/db/bunfig.toml'), '[test]\ntimeout = 30000\n');

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runTestTimeoutsCheck({ cwd: ctx.directory, env: ctx.env, runProgram });

  expect(findings).toStrictEqual([
    {
      path: 'libs/db/bunfig.toml',
      message:
        '[test] timeout = 30000 raises every test above the 5 s limit; keep the default and raise a timeout only in a lane',
    },
  ]);
});

test('it reads the files as HEAD holds them, not the working tree', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { test: 'bun test' } }),
  );

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { test: 'bun test --timeout=20000' } }),
  );

  const findings = runTestTimeoutsCheck({ cwd: ctx.directory, env: ctx.env, runProgram });

  expect(findings).toStrictEqual([]);
});

test('it throws with the path of a package.json that is not JSON', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'package.json'), '{ "scripts": ');

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  expect(() => runTestTimeoutsCheck({ cwd: ctx.directory, env: ctx.env, runProgram })).toThrow(
    'cannot parse package.json',
  );
});

test('it exits 1 and prints each finding when run as a script', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'bunfig.toml'), '[test]\ntimeout = 30000\n');

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  const result = await $`bun ${join(import.meta.dir, 'run-test-timeouts-check.ts')}`
    .cwd(ctx.directory)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);

  expect(result.stdout.toString()).toBe(
    'bunfig.toml: [test] timeout = 30000 raises every test above the 5 s limit; keep the default and raise a timeout only in a lane\n',
  );
});

test('it exits 2 and names the file when run as a script on a package.json that is not JSON', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'package.json'), '{ "scripts": ');

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  const result = await $`bun ${join(import.meta.dir, 'run-test-timeouts-check.ts')}`
    .cwd(ctx.directory)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(2);
  expect(result.stdout.toString()).toBe('');
  expect(result.stderr.toString()).toStartWith('test-timeouts: cannot parse package.json: ');
});
