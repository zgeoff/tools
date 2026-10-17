import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'check-project-verbs-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const scriptPath = fileURLToPath(new URL('check-project-verbs.sh', import.meta.url));

  const writePage = async (path: string, lines: readonly string[]) => {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), `${lines.join('\n')}\n`);
  };

  const run = (...args: readonly string[]) =>
    spawnSync('bash', [scriptPath, ...args], { cwd: dir, encoding: 'utf8' });

  return { writePage, run };
}

const skillPath = '.claude/skills/project-code-style/SKILL.md';

test('it passes when the skill and the lint config list the same names', async () => {
  const ctx = await setupTest();

  await ctx.writePage(skillPath, [
    '# Demo code style',
    '',
    '## Project verbs',
    '',
    '- `classify`: decide which category a value falls into.',
    '- `record`',
    '',
    '## Exempt names',
    '',
    '- `main`',
  ]);

  await ctx.writePage('.oxlintrc.json', [
    '{',
    '  "rules": {',
    '    // the repo verbs',
    '    "zgeoff/function-verb": ["error", { "verbs": ["classify", "record"], "exemptNames": ["main"] }],',
    '  },',
    '}',
  ]);

  const result = ctx.run();

  expect(result.status).toBe(0);

  expect(result.stdout).toBe(
    'check-project-verbs: the skill and .oxlintrc.json list the same verbs and exempt names\n',
  );
});

test('it fails on a verb missing from either side', async () => {
  const ctx = await setupTest();

  await ctx.writePage(skillPath, ['## Project verbs', '', '- `classify`', '- `mint`']);

  await ctx.writePage('.oxlintrc.json', [
    '{ "rules": { "zgeoff/function-verb": ["error", { "verbs": ["classify", "record"] }] } }',
  ]);

  const result = ctx.run();

  expect(result.status).toBe(1);

  expect(result.stdout).toBe(
    `${skillPath}: lacks \`record\`, which .oxlintrc.json lists in verbs\n` +
      `${skillPath}: lists \`mint\`, which .oxlintrc.json lacks in verbs\n`,
  );
});

test('it reads only the first backticked name of a bullet under its heading', async () => {
  const ctx = await setupTest();

  await ctx.writePage(skillPath, [
    '## Project verbs',
    '',
    'Each verb below differs from `check`.',
    '',
    '- `classify`: unlike `check`, it returns a category (`classifySegment`).',
    '',
    '## Comments',
    '',
    '- `main` is not read here.',
  ]);

  await ctx.writePage('.oxlintrc.json', [
    '{ "rules": { "zgeoff/function-verb": ["error", { "verbs": ["classify"] }] } }',
  ]);

  const result = ctx.run();

  expect(result.status).toBe(0);
});

test('it reads a verb from the first cell of a table row', async () => {
  const ctx = await setupTest();

  await ctx.writePage(skillPath, [
    '## Project verbs',
    '',
    '| Verb    | Contract                  | As opposed to |',
    '| ------- | ------------------------- | ------------- |',
    '| `admit` | verify a record and keep it | `verify`    |',
  ]);

  await ctx.writePage('.oxlintrc.json', [
    '{ "rules": { "zgeoff/function-verb": ["error", { "verbs": ["admit"] }] } }',
  ]);

  const result = ctx.run();

  expect(result.status).toBe(0);
});

test('it passes a repo with no lint config', async () => {
  const ctx = await setupTest();

  const result = ctx.run();

  expect(result.status).toBe(0);

  expect(result.stdout).toBe(
    'check-project-verbs: no .oxlintrc.json, so no project verbs to check\n',
  );
});

test('it passes a repo with no project-code-style skill whose lint config adds no names', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.oxlintrc.json', ['{ "rules": {} }']);

  const result = ctx.run();

  expect(result.status).toBe(0);
});

test('it fails a repo with no project-code-style skill whose lint config adds a verb', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.oxlintrc.json', [
    '{ "rules": { "zgeoff/function-verb": ["error", { "verbs": ["mint"] }] } }',
  ]);

  const result = ctx.run();

  expect(result.status).toBe(1);
  expect(result.stdout).toBe(`${skillPath}: lacks \`mint\`, which .oxlintrc.json lists in verbs\n`);
});
