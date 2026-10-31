import { expect, test } from 'bun:test';
import { makeCheckRunner } from './make-check-runner.ts';

test.each([
  ['prose', 'check-prose.sh'],
  ['length', 'check-length.sh'],
  ['links', 'check-links.sh'],
  ['readmes', 'check-readmes.sh'],
  ['vision', 'check-vision.sh'],
  ['skill', 'check-skill.sh'],
] as const)('it runs the %s check as its shell script with its arguments', async (name, script) => {
  const commands: string[][] = [];

  const runCheck = makeCheckRunner({
    docsFolder: '/pkg/src/docs',
    runScript: (argv) => {
      commands.push([...argv]);

      return Promise.resolve(3);
    },
  });

  const exitCode = await runCheck(name, ['docs/guide.md']);

  expect({ exitCode, commands }).toStrictEqual({
    exitCode: 3,
    commands: [['bash', `/pkg/src/docs/${script}`, 'docs/guide.md']],
  });
});
