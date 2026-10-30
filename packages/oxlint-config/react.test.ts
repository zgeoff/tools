import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runOxlint } from './test-utils/run-oxlint.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'react-overlay-test-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const baseConfig = join(import.meta.dir, 'oxlintrc.json');
  const overlay = join(import.meta.dir, 'react.json');

  await writeFile(
    join(directory, 'bare.json'),
    JSON.stringify({ extends: [baseConfig], plugins: ['react'] }),
  );

  await writeFile(
    join(directory, 'layered.json'),
    JSON.stringify({ extends: [baseConfig, overlay] }),
  );

  return { directory };
}

test.each([
  ['react-in-jsx-scope', 'export function Panel() {\n  return <div />;\n}\n'],
  [
    'jsx-props-no-spreading',
    'export function Panel(props: Readonly<Record<string, string>>) {\n  return <div {...props} />;\n}\n',
  ],
  [
    'jsx-max-depth',
    'export function Panel() {\n  return (\n    <div>\n      <div>\n        <div>\n          <span />\n        </div>\n      </div>\n    </div>\n  );\n}\n',
  ],
])(
  'it turns off react/%s, which the react plugin reports without the overlay',
  async (rule, source) => {
    const ctx = await setupTest();

    await writeFile(join(ctx.directory, 'panel.tsx'), source);

    const bareRun = await runOxlint(['-c', 'bare.json', 'panel.tsx'], ctx.directory);
    const layeredRun = await runOxlint(['-c', 'layered.json', 'panel.tsx'], ctx.directory);

    expect(bareRun.stdout).toInclude(`react(${rule})`);
    expect(layeredRun.stdout).not.toInclude(`react(${rule})`);
  },
);

test('it turns on the react plugin', async () => {
  const source =
    "export function Panel() {\n  return ['tea', 'milk'].map((name) => <span>{name}</span>);\n}\n";

  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'panel.tsx'), source);

  const run = await runOxlint(['-c', 'layered.json', 'panel.tsx'], ctx.directory);

  expect(run.stdout).toInclude('react(jsx-key)');
});
