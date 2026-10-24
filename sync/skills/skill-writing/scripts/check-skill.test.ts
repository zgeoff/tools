import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'check-skill-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  // A pre-push hook in a linked worktree exports GIT_DIR, which would point git init and the
  // script's git calls at the real repository.
  const env = {
    PATH: process.env['PATH'],
    HOME: directory,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };

  await $`git init -q`.cwd(directory).env(env).quiet();

  const scriptPath = fileURLToPath(new URL('check-skill.sh', import.meta.url));

  const writePage = async (path: string, lines: readonly string[]) => {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), `${lines.join('\n')}\n`);
  };

  const run = (...args: readonly string[]) =>
    $`bash ${scriptPath} ${args}`.cwd(directory).env(env).nothrow().quiet();

  return { writePage, run };
}

test('it passes a skill with a name, a description, and short files', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description:',
    '  Commands and traps for the demo service. Load it before running or writing a demo test.',
    '---',
    '',
    '# Demo',
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-skill: 1 skills, 0 errors, 0 warnings\n',
    stderr: '',
  });
});

test('it fails a skill with no description', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', ['---', 'name: demo', '---']);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      '.claude/skills/demo/SKILL.md: has no description\n' +
      'check-skill: 1 skills, 1 errors, 0 warnings\n',
    stderr: '',
  });
});

test('it reads a name and description past quotes and trailing comments', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo # the command name',
    "description: 'Commands for the demo service. Load it before a demo test.' # one line",
    '---',
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-skill: 1 skills, 0 errors, 0 warnings\n',
    stderr: '',
  });
});

test('it fails a plain description that holds a colon and a space', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description:',
    '  How to run the demo service: start it, then seed it. Load it before a demo test.',
    '---',
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      '.claude/skills/demo/SKILL.md: description holds a colon and a space, which YAML reads as a key in a plain scalar; reword it, or quote it or write it as a block scalar (>-)\n' +
      'check-skill: 1 skills, 1 errors, 0 warnings\n',
    stderr: '',
  });
});

test('it passes a colon and a space inside a quoted or block description, on either line', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/quoted/SKILL.md', [
    '---',
    'name: quoted',
    "description: 'How to run the demo service: start it, then seed it.'",
    '---',
  ]);

  await ctx.writePage('.claude/skills/next-line/SKILL.md', [
    '---',
    'name: next-line',
    'description:',
    '  "How to run the demo service: start it, then seed it."',
    '---',
  ]);

  await ctx.writePage('.claude/skills/block/SKILL.md', [
    '---',
    'name: block',
    'description: >-',
    '  How to run the demo service: start it, then seed it.',
    '---',
  ]);

  await ctx.writePage('.claude/skills/commented-block/SKILL.md', [
    '---',
    'name: commented-block',
    'description: >2- # one paragraph',
    '  How to run the demo service: start it, then seed it.',
    '---',
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-skill: 4 skills, 0 errors, 0 warnings\n',
    stderr: '',
  });
});

test('it reads no colon in a comment after a plain description line', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description:',
    '  Commands for the demo service. # usage: local',
    '---',
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-skill: 1 skills, 0 errors, 0 warnings\n',
    stderr: '',
  });
});

test('it fails a description that holds only a comment', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description: # TODO',
    '---',
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      '.claude/skills/demo/SKILL.md: has no description\n' +
      'check-skill: 1 skills, 1 errors, 0 warnings\n',
    stderr: '',
  });
});

test('it fails a description that YAML reads as null', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description: null',
    '---',
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      '.claude/skills/demo/SKILL.md: has no description\n' +
      'check-skill: 1 skills, 1 errors, 0 warnings\n',
    stderr: '',
  });
});

test('it reads a null followed by a folded line as text', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description: null',
    '  checks for the demo service. Load it before a demo test.',
    '---',
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-skill: 1 skills, 0 errors, 0 warnings\n',
    stderr: '',
  });
});

test('it reads a null with a hash and no space before it as text', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description: null#marker',
    '---',
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-skill: 1 skills, 0 errors, 0 warnings\n',
    stderr: '',
  });
});

test('it fails a line anchor in a single-quoted HTML link', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description:',
    '  Commands and traps for the demo service. Load it before running or writing a demo test.',
    '---',
    '',
    "See <a href='guide.md#L42'>the guide</a>.",
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      '.claude/skills/demo/SKILL.md:7: link guide.md#L42 has a line anchor; name the target in the link text instead\n' +
      'check-skill: 1 skills, 1 errors, 0 warnings\n',
    stderr: '',
  });
});

test('it fails a name that differs from the folder', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/widgets/SKILL.md', [
    '---',
    'name: demo',
    'description:',
    '  Commands and traps for the demo service. Load it before running or writing a demo test.',
    '---',
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      '.claude/skills/widgets/SKILL.md: name demo does not match the folder widgets\n' +
      'check-skill: 1 skills, 1 errors, 0 warnings\n',
    stderr: '',
  });
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

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      '.claude/skills/demo/SKILL.md: description is 1099 characters, over the limit of 1024\n' +
      'check-skill: 1 skills, 1 errors, 0 warnings\n',
    stderr: '',
  });
});

test('it fails a link with a line anchor, but not one inside code', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description:',
    '  Commands and traps for the demo service. Load it before running or writing a demo test.',
    '---',
    '',
    'See [`loadTheme`](../../../src/load-theme.ts#L42).',
    'Never write `[x](y.ts#L1)`.',
    '',
    '```markdown',
    '[x](y.ts#L1)',
    '```',
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      '.claude/skills/demo/SKILL.md:7: link ../../../src/load-theme.ts#L42 has a line anchor; name the target in the link text instead\n' +
      'check-skill: 1 skills, 1 errors, 0 warnings\n',
    stderr: '',
  });
});

test('it warns and passes when SKILL.md is over 500 lines', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description:',
    '  Commands and traps for the demo service. Load it before running or writing a demo test.',
    '---',
    ...Array.from({ length: 500 }, () => 'The tool reads one file.'),
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout:
      '.claude/skills/demo/SKILL.md: 505 lines, over 500; check that each section is one most tasks need (warning)\n' +
      'check-skill: 1 skills, 0 errors, 1 warnings\n',
    stderr: '',
  });
});

test('it warns about a reference that SKILL.md does not list under References', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description:',
    '  Commands and traps for the demo service. Load it before running or writing a demo test.',
    '---',
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

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout:
      '.claude/skills/demo/references/database.md: SKILL.md does not list it under ## References; add a line naming the task that needs it (warning)\n' +
      'check-skill: 1 skills, 0 errors, 1 warnings\n',
    stderr: '',
  });
});

test('it warns about a long reference with no contents list', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description:',
    '  Commands and traps for the demo service. Load it before running or writing a demo test.',
    '---',
  ]);

  await ctx.writePage('.claude/skills/demo/references/e2e.md', [
    '# The harness',
    ...Array.from({ length: 100 }, () => 'The tool reads one file.'),
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout:
      '.claude/skills/demo/references/e2e.md: 101 lines with no contents list near the top; open with links to its headings (warning)\n' +
      '.claude/skills/demo/references/e2e.md: SKILL.md does not list it under ## References; add a line naming the task that needs it (warning)\n' +
      'check-skill: 1 skills, 0 errors, 2 warnings\n',
    stderr: '',
  });
});

test('it accepts a long reference that opens with a contents list', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description:',
    '  Commands and traps for the demo service. Load it before running or writing a demo test.',
    '---',
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

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-skill: 1 skills, 0 errors, 0 warnings\n',
    stderr: '',
  });
});

test('it warns about a reference that links to another reference', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description:',
    '  Commands and traps for the demo service. Load it before running or writing a demo test.',
    '---',
  ]);

  await ctx.writePage('.claude/skills/demo/references/http.md', ['# HTTP']);
  await ctx.writePage('.claude/skills/demo/references/frontend.md', ['See [HTTP](./http.md).']);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout:
      '.claude/skills/demo/references/frontend.md:1: links to another reference (.claude/skills/demo/references/http.md); link it from SKILL.md instead (warning)\n' +
      '.claude/skills/demo/references/frontend.md: SKILL.md does not list it under ## References; add a line naming the task that needs it (warning)\n' +
      '.claude/skills/demo/references/http.md: SKILL.md does not list it under ## References; add a line naming the task that needs it (warning)\n' +
      'check-skill: 1 skills, 0 errors, 3 warnings\n',
    stderr: '',
  });
});

test('it warns about a code-formatted path to a repo file, but not a linked one', async () => {
  const ctx = await setupTest();

  await ctx.writePage('src/load-theme.ts', ['export {};']);

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description:',
    '  Commands and traps for the demo service. Load it before running or writing a demo test.',
    '---',
    '',
    'Read `src/load-theme.ts` first.',
    'Then [`loadTheme`](../../../src/load-theme.ts) and [`src/load-theme.ts`](../../../src/load-theme.ts).',
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout:
      '.claude/skills/demo/SKILL.md:7: `src/load-theme.ts` names a file in the repo; link it instead (warning)\n' +
      'check-skill: 1 skills, 0 errors, 1 warnings\n',
    stderr: '',
  });
});

test('it reads no code-formatted path in a table row as a missing link', async () => {
  const ctx = await setupTest();

  await ctx.writePage('scripts/test-go.sh', ['echo go']);

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description:',
    '  Commands and traps for the demo service. Load it before running or writing a demo test.',
    '---',
    '',
    '| Run   | Command              |',
    '| ----- | -------------------- |',
    '| Go    | `scripts/test-go.sh` |',
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-skill: 1 skills, 0 errors, 0 warnings\n',
    stderr: '',
  });
});

test('it skips a skill that git marks linguist-vendored', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.gitattributes', ['.claude/skills/vendor-db/** linguist-vendored']);
  await ctx.writePage('.claude/skills/vendor-db/SKILL.md', ['# No frontmatter']);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-skill: no skills to check\n',
    stderr: '',
  });
});

test('it skips a vendored reference inside a skill it checks', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.gitattributes', [
    '.claude/skills/demo/references/vendor.md linguist-vendored',
  ]);

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description:',
    '  Commands and traps for the demo service. Load it before running or writing a demo test.',
    '---',
  ]);

  await ctx.writePage('.claude/skills/demo/references/vendor.md', ['See [x](y.ts#L1).']);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-skill: 1 skills, 0 errors, 0 warnings\n',
    stderr: '',
  });
});

test('it checks only the skill folders it is given', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description:',
    '  Commands and traps for the demo service. Load it before running or writing a demo test.',
    '---',
  ]);

  await ctx.writePage('.claude/skills/broken/SKILL.md', ['# No frontmatter']);

  const result = await ctx.run('.claude/skills/demo');

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-skill: 1 skills, 0 errors, 0 warnings\n',
    stderr: '',
  });
});

test('it rejects a folder with no SKILL.md', async () => {
  const ctx = await setupTest();

  await ctx.writePage('notes/todo.md', ['# Todo']);

  const result = await ctx.run('notes');

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr: 'check-skill: notes has no SKILL.md\n',
  });
});

test('it reads no link inside an HTML comment', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description: Commands for the demo service. Load it before a demo test.',
    '---',
    '',
    '<!-- [an old pointer](../../../src/demo.ts#L12) -->',
    '<!--',
    '[another](../../../src/demo.ts#L40)',
    '-->',
    'Run the demo.',
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'check-skill: 1 skills, 0 errors, 0 warnings\n',
    stderr: '',
  });
});

test('it reads a link after a comment marker inside inline code', async () => {
  const ctx = await setupTest();

  await ctx.writePage('.claude/skills/demo/SKILL.md', [
    '---',
    'name: demo',
    'description: Commands for the demo service. Load it before a demo test.',
    '---',
    '',
    'A repo-sync marker opens with `<!--` on its own line.',
    '',
    'See [the entry](../../../src/demo.ts#L12).',
  ]);

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      '.claude/skills/demo/SKILL.md:8: link ../../../src/demo.ts#L12 has a line anchor; name the target in the link text instead\n' +
      'check-skill: 1 skills, 1 errors, 0 warnings\n',
    stderr: '',
  });
});
