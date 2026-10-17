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

test('it reads a name and description past quotes and trailing comments', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo # the command name',
    "description: 'Commands for the demo service. Load it before a demo test.' # one line",
    '---',
  ]);

  const result = ctx.run();

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('check-skill: 1 skills, 0 errors, 0 warnings\n');
});

test('it fails a description that holds only a comment', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description: # TODO',
    '---',
  ]);

  const result = ctx.run();

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('.claude/skills/demo/SKILL.md: has no description\n');
});

test('it fails a description that YAML reads as null', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description: null',
    '---',
  ]);

  const result = ctx.run();

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('.claude/skills/demo/SKILL.md: has no description\n');
});

test('it fails a line anchor in a single-quoted HTML link', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    ...frontmatter,
    '',
    "See <a href='guide.md#L42'>the guide</a>.",
  ]);

  const result = ctx.run();

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('link guide.md#L42 has a line anchor');
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
    '.claude/skills/demo/SKILL.md: 505 lines, over 500; check that each section is one most tasks need (warning)\n',
  );
});

test('it warns about a reference that SKILL.md does not list under References', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    ...frontmatter,
    '',
    '## References',
    '',
    '- [HTTP](./references/http.md): a client of a remote service.',
    '',
    '## Details',
    '',
    'See [the database](./references/database.md).',
  ]);

  await ctx.writePage('.claude/skills/demo/references/http.md', ['# HTTP']);
  await ctx.writePage('.claude/skills/demo/references/database.md', ['# Database']);

  const result = ctx.run();

  expect(result.status).toBe(0);

  expect(result.stdout).toBe(
    '.claude/skills/demo/references/database.md: SKILL.md does not list it under ## References; add a line naming the task that needs it (warning)\n' +
      'check-skill: 1 skills, 0 errors, 1 warnings\n',
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

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    ...frontmatter,
    '',
    '## References',
    '',
    '- [The harness](./references/e2e.md): an end-to-end journey.',
  ]);

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

test('it reads no code-formatted path in a table row as a missing link', async () => {
  const ctx = await setupTest();

  await ctx.writePage('scripts/test-go.sh', ['echo go']);

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    ...frontmatter,
    '',
    '| Run   | Command              |',
    '| ----- | -------------------- |',
    '| Go    | `scripts/test-go.sh` |',
  ]);

  const result = ctx.run();

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('check-skill: 1 skills, 0 errors, 0 warnings\n');
});

test('it skips a skill that git marks linguist-vendored', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.gitattributes', ['.claude/skills/vendor-db/** linguist-vendored']);
  await ctx.writePage('.claude/skills/vendor-db/SKILL.md', ['# No frontmatter']);

  const result = ctx.run();

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('check-skill: no skills to check\n');
});

test('it skips a vendored reference inside a skill it checks', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.gitattributes', [
    '.claude/skills/demo/references/vendor.md linguist-vendored',
  ]);

  await ctx.writePage('.claude/skills/demo/SKILL.md', frontmatter);
  await ctx.writePage('.claude/skills/demo/references/vendor.md', ['See [x](y.ts#L1).']);

  const result = ctx.run();

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('check-skill: 1 skills, 0 errors, 0 warnings\n');
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
