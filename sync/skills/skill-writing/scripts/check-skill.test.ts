import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'check-skill-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  spawnSync('git', ['init', '-q'], { cwd: dir });

  const scriptPath = fileURLToPath(new URL('check-skill.sh', import.meta.url));

  const writePage = async (path: string, lines: readonly string[]) => {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), `${lines.join('\n')}\n`);
  };

  const run = (...args: readonly string[]) =>
    spawnSync('bash', [scriptPath, ...args], { cwd: dir, encoding: 'utf8' });

  return { writePage, run };
}

const frontmatter = [
  '---',
  'name: demo',
  'description:',
  '  Commands and traps for the demo service. Load it before running or writing a demo test.',
  '---',
];

test('it passes a skill with a name, a description, and short files', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [...frontmatter, '', '# Demo']);

  const result = ctx.run();

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('check-skill: 1 skills, 0 errors, 0 warnings\n');
});

test('it fails a skill with no description', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', ['---', 'name: demo', '---']);

  const result = ctx.run();

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('.claude/skills/demo/SKILL.md: has no description\n');
});

test('it fails a name that differs from the folder', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/widgets/SKILL.md', frontmatter);

  const result = ctx.run();

  expect(result.status).toBe(1);

  expect(result.stdout).toInclude(
    '.claude/skills/widgets/SKILL.md: name demo does not match the folder widgets\n',
  );
});

test('it fails a folded description over 1,024 characters', async () => {
  const ctx = await setupTest();

  const line = `  ${'word '.repeat(19)}word`;

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description:',
    ...Array.from({ length: 11 }, () => line),
    '---',
  ]);

  const result = ctx.run();

  expect(result.status).toBe(1);

  expect(result.stdout).toInclude(
    '.claude/skills/demo/SKILL.md: description is 1099 characters, over the limit of 1024\n',
  );
});

test('it fails a link with a line anchor, but not one inside code', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    ...frontmatter,
    '',
    'See [`loadTheme`](../../../src/load-theme.ts#L42).',
    'Never write `[x](y.ts#L1)`.',
    '',
    '```markdown',
    '[x](y.ts#L1)',
    '```',
  ]);

  const result = ctx.run();

  expect(result.status).toBe(1);

  expect(result.stdout).toBe(
    '.claude/skills/demo/SKILL.md:7: link ../../../src/load-theme.ts#L42 has a line anchor; name the target in the link text instead\n' +
      'check-skill: 1 skills, 1 errors, 0 warnings\n',
  );
});

test('it warns and passes when SKILL.md is over 500 lines', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    ...frontmatter,
    ...Array.from({ length: 500 }, () => 'The tool reads one file.'),
  ]);

  const result = ctx.run();

  expect(result.status).toBe(0);

  expect(result.stdout).toInclude(
    '.claude/skills/demo/SKILL.md: 505 lines, over the limit of 500 (warning)\n',
  );
});

test('it warns about a long reference with no contents list', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', frontmatter);

  await ctx.writePage('.claude/skills/demo/references/e2e.md', [
    '# The harness',
    ...Array.from({ length: 100 }, () => 'The tool reads one file.'),
  ]);

  const result = ctx.run();

  expect(result.status).toBe(0);

  expect(result.stdout).toInclude(
    '.claude/skills/demo/references/e2e.md: 101 lines with no contents list near the top; open with links to its headings (warning)\n',
  );
});

test('it accepts a long reference that opens with a contents list', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', frontmatter);

  await ctx.writePage('.claude/skills/demo/references/e2e.md', [
    '# The harness',
    '',
    '- [Suites](#suites)',
    '- [Host safety](#host-safety)',
    '',
    '## Suites',
    ...Array.from({ length: 100 }, () => 'The tool reads one file.'),
    '## Host safety',
  ]);

  const result = ctx.run();

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('check-skill: 1 skills, 0 errors, 0 warnings\n');
});

test('it warns about a reference that links to another reference', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', frontmatter);
  await ctx.writePage('.claude/skills/demo/references/http.md', ['# HTTP']);
  await ctx.writePage('.claude/skills/demo/references/frontend.md', ['See [HTTP](./http.md).']);

  const result = ctx.run();

  expect(result.status).toBe(0);

  expect(result.stdout).toInclude(
    '.claude/skills/demo/references/frontend.md:1: links to another reference (.claude/skills/demo/references/http.md); link it from SKILL.md instead (warning)\n',
  );
});

test('it warns about a code-formatted path to a repo file, but not a linked one', async () => {
  const ctx = await setupTest();

  await ctx.writePage('src/load-theme.ts', ['export {};']);

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    ...frontmatter,
    '',
    'Read `src/load-theme.ts` first.',
    'Then [`loadTheme`](../../../src/load-theme.ts) and [`src/load-theme.ts`](../../../src/load-theme.ts).',
  ]);

  const result = ctx.run();

  expect(result.status).toBe(0);

  expect(result.stdout).toBe(
    '.claude/skills/demo/SKILL.md:7: `src/load-theme.ts` names a file in the repo; link it instead (warning)\n' +
      'check-skill: 1 skills, 0 errors, 1 warnings\n',
  );
});

test('it skips a skill that git marks linguist-vendored', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.gitattributes', ['.claude/skills/vendor-db/** linguist-vendored']);
  await ctx.writePage('.claude/skills/vendor-db/SKILL.md', ['# No frontmatter']);

  const result = ctx.run();

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('check-skill: no skills to check\n');
});

test('it checks only the skill folders it is given', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', frontmatter);
  await ctx.writePage('.claude/skills/broken/SKILL.md', ['# No frontmatter']);

  const result = ctx.run('.claude/skills/demo');

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('check-skill: 1 skills, 0 errors, 0 warnings\n');
});

test('it rejects a folder with no SKILL.md', async () => {
  const ctx = await setupTest();

  await ctx.writePage('notes/todo.md', ['# Todo']);

  const result = ctx.run('notes');

  expect(result.status).toBe(2);
  expect(result.stderr).toBe('check-skill: notes has no SKILL.md\n');
});
