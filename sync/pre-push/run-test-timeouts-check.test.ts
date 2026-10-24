import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
        'script "test" passes --timeout=20000 to bun test, above the 5000 ms limit of the unit lane; find its cause in the "Slow tests" section of the testing skill and fix it',
    },
    {
      path: 'packages/kettle/package.json',
      message:
        'script "test:slow" passes --timeout=30000 to bun test, above the 5000 ms limit of the unit lane; find its cause in the "Slow tests" section of the testing skill and fix it',
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
        'script "test:daemon" passes --timeout=20000 to bun test, above the 5000 ms limit of the unit lane; find its cause in the "Slow tests" section of the testing skill and fix it',
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
        'script "test" passes --timeout=30000 to bun test, above the 5000 ms limit of the unit lane; find its cause in the "Slow tests" section of the testing skill and fix it',
    },
  ]);
});

test('it exempts test:related', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { 'test:related': 'bun test --timeout=15000' } }),
  );

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runTestTimeoutsCheck({ cwd: ctx.directory, env: ctx.env, runProgram });

  expect(findings).toStrictEqual([]);
});

test('it gives a lane in the array form of the lanes option a 15 s limit', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, '.oxlintrc.json'),
    '{\n  // the binary suites run against a built daemon\n  "rules": { "zgeoff/max-test-timeout": ["error", { "lanes": ["binary"] }] },\n}\n',
  );

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({
      scripts: {
        'test:binary': 'bun test --timeout 15000 e2e/daemon-*.test.ts',
        'test:binary:slow': 'bun test --timeout 15001 e2e/daemon-*.test.ts',
      },
    }),
  );

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runTestTimeoutsCheck({ cwd: ctx.directory, env: ctx.env, runProgram });

  expect(findings).toStrictEqual([
    {
      path: 'package.json',
      message:
        'script "test:binary:slow" passes --timeout=15001 to bun test, above the 5000 ms limit of the unit lane; find its cause in the "Slow tests" section of the testing skill and fix it',
    },
  ]);
});

test('it reads the limit of a lane that the object form of the lanes option declares', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, '.oxlintrc.json'),
    '{ "rules": { "zgeoff/max-test-timeout": ["error", { "lanes": { "kvm": 60000, "e2e": 30000 } }] } }\n',
  );

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({
      scripts: {
        'test:kvm': 'bun test --timeout=60000 .kvm.test.ts',
        'test:e2e': 'bun test --timeout=30001 e2e',
      },
    }),
  );

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runTestTimeoutsCheck({ cwd: ctx.directory, env: ctx.env, runProgram });

  expect(findings).toStrictEqual([
    {
      path: 'package.json',
      message:
        'script "test:e2e" passes --timeout=30001 to bun test, above the 30000 ms limit of the e2e lane; find its cause in the "Slow tests" section of the testing skill and fix it',
    },
  ]);
});

test('it holds the same lane limits as the Lanes table in the shared testing skill', async () => {
  const ctx = await setupTest();

  const markdown = await readFile(
    join(import.meta.dir, '..', 'skills', 'testing', 'SKILL.md'),
    'utf8',
  );

  const rows = [
    ...markdown.matchAll(/^\| (?<lane>[a-z0-9-]+) +\| [^|]+\| (?<seconds>\d+) s +\|/gmu),
  ].map((match) => ({
    script: match.groups?.['lane'] === 'unit' ? 'test' : `test:${match.groups?.['lane']}`,
    limitMs: Number(match.groups?.['seconds']) * 1000,
  }));

  const scripts = rows.flatMap((row): [string, string][] => [
    [row.script, `bun test --timeout=${row.limitMs}`],
    [`${row.script}:over`, `bun test --timeout=${row.limitMs + 1}`],
  ]);

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: Object.fromEntries(scripts) }),
  );

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runTestTimeoutsCheck({ cwd: ctx.directory, env: ctx.env, runProgram });

  expect(rows.length).toBe(7);

  expect(findings.map((finding) => finding.message.split(' ')[1])).toIncludeSameMembers(
    rows.map((row) => `"${row.script}:over"`),
  );
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
        'script "test:binary" passes --timeout=20000 to bun test, above the 5000 ms limit of the unit lane; find its cause in the "Slow tests" section of the testing skill and fix it',
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
        '[test] timeout = 30000 raises every test above the 5000 ms limit of the unit lane; find its cause in the "Slow tests" section of the testing skill and fix it',
    },
  ]);
});

test('it reads a bunfig.toml in an e2e/ directory against the e2e limit', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'apps/web/e2e'), { recursive: true });
  await writeFile(join(ctx.directory, 'apps/web/package.json'), '{}');
  await writeFile(join(ctx.directory, 'apps/web/e2e/bunfig.toml'), '[test]\ntimeout = 15000\n');
  await mkdir(join(ctx.directory, 'apps/web-e2e'), { recursive: true });
  await writeFile(join(ctx.directory, 'apps/web-e2e/package.json'), '{}');
  await writeFile(join(ctx.directory, 'apps/web-e2e/bunfig.toml'), '[test]\ntimeout = 20000\n');

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runTestTimeoutsCheck({ cwd: ctx.directory, env: ctx.env, runProgram });

  expect(findings).toStrictEqual([
    {
      path: 'apps/web-e2e/bunfig.toml',
      message:
        '[test] timeout = 20000 raises every test above the 15000 ms limit of the e2e lane; find its cause in the "Slow tests" section of the testing skill and fix it',
    },
  ]);
});

test('it reads a bunfig.toml in an evals/ directory against the unit limit', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'evals'), { recursive: true });
  await writeFile(join(ctx.directory, 'evals/bunfig.toml'), '[test]\ntimeout = 6000\n');

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runTestTimeoutsCheck({ cwd: ctx.directory, env: ctx.env, runProgram });

  expect(findings).toStrictEqual([
    {
      path: 'evals/bunfig.toml',
      message:
        '[test] timeout = 6000 raises every test above the 5000 ms limit of the unit lane; find its cause in the "Slow tests" section of the testing skill and fix it',
    },
  ]);
});

test('it reports an oxlint config that turns a timeout rule off or down to a warning without a ticket', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, '.oxlintrc.json'),
    [
      '{',
      '  "rules": { "zgeoff/max-test-timeout": ["error", { "lanes": { "kvm": 60000 } }] },',
      '  "overrides": [',
      '    {',
      '      "files": ["legacy/**"],',
      '      "rules": {',
      '        "zgeoff/max-test-timeout": "off",',
      '        "zgeoff/test-timeout-exception-ticket": ["warn"],',
      '        // the restore suite waits on a real snapshot: 48 s on CI, OPS-212',
      '        "zgeoff/no-test-sleep": "off",',
      '      },',
      '    },',
      '    {',
      '      "files": ["restore/**"],',
      '      // the restore suite waits on a real snapshot: 48 s on CI, OPS-212',
      '      "rules": { "zgeoff/max-test-timeout": "off" },',
      '    },',
      '  ],',
      '}',
      '',
    ].join('\n'),
  );

  await mkdir(join(ctx.directory, 'packages/kettle'), { recursive: true });

  await writeFile(
    join(ctx.directory, 'packages/kettle/.oxlintrc.json'),
    [
      '{',
      '  // "zgeoff/max-test-timeout": "off",',
      '  "rules": { "zgeoff/max-test-timeout": "error", "zgeoff/test-timeout-exception-ticket": 0 },',
      '}',
      '',
    ].join('\n'),
  );

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runTestTimeoutsCheck({ cwd: ctx.directory, env: ctx.env, runProgram });

  expect(findings).toStrictEqual([
    {
      path: '.oxlintrc.json',
      message:
        'line 7 turns zgeoff/max-test-timeout off or down to a warning; give the setting a comment that names the ticket that tracks the fix, or "floor:" and the evidence that the time cannot move, as the "Slow tests" section of the testing skill describes',
    },
    {
      path: '.oxlintrc.json',
      message:
        'line 8 turns zgeoff/test-timeout-exception-ticket off or down to a warning; give the setting a comment that names the ticket that tracks the fix, or "floor:" and the evidence that the time cannot move, as the "Slow tests" section of the testing skill describes',
    },
    {
      path: 'packages/kettle/.oxlintrc.json',
      message:
        'line 3 turns zgeoff/test-timeout-exception-ticket off or down to a warning; give the setting a comment that names the ticket that tracks the fix, or "floor:" and the evidence that the time cannot move, as the "Slow tests" section of the testing skill describes',
    },
  ]);
});

test('it accepts a setting whose override names a ticket or a floor in its own comment', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, '.oxlintrc.json'),
    [
      '{',
      '  "overrides": [',
      '    // the restore suite waits on a real snapshot: 48 s on CI, OPS-212',
      '    {',
      '      "files": ["restore/**"],',
      '      "rules": { "zgeoff/max-test-timeout": "off" },',
      '    },',
      '    {',
      '      "files": ["legacy/**"],',
      '      "rules": {',
      '        "zgeoff/no-test-sleep": "off", // OPS-212',
      '        "zgeoff/max-test-timeout": "warn",',
      '      },',
      '    },',
      '    {',
      '      "files": ["boot/**"],',
      '      // each test boots two VMs: 48 s on CI; floor: two VM boots plus a restore',
      '      "rules": { "zgeoff/max-test-timeout": "off" },',
      '    },',
      '    {',
      '      "files": ["mount/**"],',
      '      // floor:',
      '      "rules": { "zgeoff/max-test-timeout": "off" },',
      '    },',
      '    {',
      '      "files": ["snapshot/**"],',
      '      /* floor:',
      '       *',
      '       */',
      '      "rules": { "zgeoff/max-test-timeout": "off" },',
      '    },',
      '  ],',
      '}',
      '',
    ].join('\n'),
  );

  await $`git add --all`.cwd(ctx.directory).env(ctx.env);
  await $`git commit --quiet -m ${'chore: add the scenario'}`.cwd(ctx.directory).env(ctx.env);

  const findings = runTestTimeoutsCheck({ cwd: ctx.directory, env: ctx.env, runProgram });

  expect(findings).toStrictEqual([
    {
      path: '.oxlintrc.json',
      message:
        'line 12 turns zgeoff/max-test-timeout off or down to a warning; give the setting a comment that names the ticket that tracks the fix, or "floor:" and the evidence that the time cannot move, as the "Slow tests" section of the testing skill describes',
    },
    {
      path: '.oxlintrc.json',
      message:
        'line 23 turns zgeoff/max-test-timeout off or down to a warning; give the setting a comment that names the ticket that tracks the fix, or "floor:" and the evidence that the time cannot move, as the "Slow tests" section of the testing skill describes',
    },
    {
      path: '.oxlintrc.json',
      message:
        'line 30 turns zgeoff/max-test-timeout off or down to a warning; give the setting a comment that names the ticket that tracks the fix, or "floor:" and the evidence that the time cannot move, as the "Slow tests" section of the testing skill describes',
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
    'bunfig.toml: [test] timeout = 30000 raises every test above the 5000 ms limit of the unit lane; find its cause in the "Slow tests" section of the testing skill and fix it\n',
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
