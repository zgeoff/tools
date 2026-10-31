import { expect, test } from 'bun:test';
import type { RepoCheckName } from './make-check-runner.ts';
import { makeCheckRunner } from './make-check-runner.ts';

function setupTest(exitCode: number) {
  const calls: string[][] = [];

  const makeRepoCheck = (name: RepoCheckName) => (args: readonly string[]) => {
    calls.push([name, ...args]);

    return exitCode;
  };

  const repoChecks = {
    commits: makeRepoCheck('commits'),
    'local-paths': makeRepoCheck('local-paths'),
    'test-timeouts': makeRepoCheck('test-timeouts'),
    workflows: makeRepoCheck('workflows'),
    'dependency-gates': makeRepoCheck('dependency-gates'),
    uncommitted: makeRepoCheck('uncommitted'),
  };

  return { calls, repoChecks };
}

test.each([
  ['prose', 'check-prose.sh'],
  ['length', 'check-length.sh'],
  ['links', 'check-links.sh'],
  ['readmes', 'check-readmes.sh'],
  ['vision', 'check-vision.sh'],
  ['skill', 'check-skill.sh'],
] as const)('it runs the %s check as its shell script with its arguments', async (name, script) => {
  const ctx = setupTest(0);
  const commands: string[][] = [];

  const runCheck = makeCheckRunner({
    docsFolder: '/pkg/src/docs',
    runScript: (argv) => {
      commands.push([...argv]);

      return Promise.resolve(3);
    },
    repoChecks: ctx.repoChecks,
  });

  const exitCode = await runCheck(name, ['docs/guide.md']);

  expect({ exitCode, commands }).toStrictEqual({
    exitCode: 3,
    commands: [['bash', `/pkg/src/docs/${script}`, 'docs/guide.md']],
  });
});

test.each([
  ['commits'],
  ['local-paths'],
  ['test-timeouts'],
  ['workflows'],
  ['dependency-gates'],
  ['uncommitted'],
] as const)('it runs the %s check through the repo check it is given', async (name) => {
  const ctx = setupTest(1);

  const runCheck = makeCheckRunner({
    docsFolder: '/pkg/src/docs',
    runScript: () => Promise.resolve(0),
    repoChecks: ctx.repoChecks,
  });

  const exitCode = await runCheck(name, ['--pushed-refs']);

  expect({ exitCode, calls: ctx.calls }).toStrictEqual({
    exitCode: 1,
    calls: [[name, '--pushed-refs']],
  });
});
