import { expect, mock, test } from 'bun:test';
import { makeCheckRunner } from './make-check-runner.ts';

test.each([
  ['prose', 'check-prose.sh'],
  ['length', 'check-length.sh'],
  ['links', 'check-links.sh'],
  ['readmes', 'check-readmes.sh'],
  ['vision', 'check-vision.sh'],
  ['skill', 'check-skill.sh'],
] as const)('it runs the %s check as its shell script with its arguments', async (name, script) => {
  const runScript = mock<(argv: readonly string[]) => Promise<number>>(() => Promise.resolve(3));

  const runCheck = makeCheckRunner({
    docsFolder: '/pkg/src/docs',
    runScript,
    repoChecks: {
      commits: mock(() => 0),
      'local-paths': mock(() => 0),
      'test-timeouts': mock(() => 0),
      workflows: mock(() => 0),
      'dependency-gates': mock(() => 0),
      uncommitted: mock(() => 0),
    },
  });

  const exitCode = await runCheck(name, ['docs/guide.md']);

  expect(exitCode).toBe(3);

  expect(runScript.mock.calls).toStrictEqual([
    [['bash', `/pkg/src/docs/${script}`, 'docs/guide.md']],
  ]);
});

test.each([
  ['commits'],
  ['local-paths'],
  ['test-timeouts'],
  ['workflows'],
  ['dependency-gates'],
  ['uncommitted'],
] as const)('it runs the %s check through the repo check it is given', async (name) => {
  const repoChecks = {
    commits: mock(() => 1),
    'local-paths': mock(() => 1),
    'test-timeouts': mock(() => 1),
    workflows: mock(() => 1),
    'dependency-gates': mock(() => 1),
    uncommitted: mock(() => 1),
  };

  const runScript = mock(() => Promise.resolve(0));
  const runCheck = makeCheckRunner({ docsFolder: '/pkg/src/docs', runScript, repoChecks });

  const exitCode = await runCheck(name, ['--pushed-refs']);

  expect(exitCode).toBe(1);
  expect(repoChecks[name]).toHaveBeenCalledTimes(1);
  expect(repoChecks[name]).toHaveBeenCalledWith(['--pushed-refs']);
  expect(runScript).not.toHaveBeenCalled();
});
