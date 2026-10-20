import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'check-prose-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  // A clean environment: a pre-push hook in a linked worktree exports GIT_DIR, which would point
  // git init and the script's git calls at the real repository.
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

  const runGit = (...args: readonly string[]) =>
    spawnSync('git', args, { cwd: directory, env, encoding: 'utf8' });

  runGit('init', '-q');

  const scriptPath = fileURLToPath(new URL('check-prose.sh', import.meta.url));
  const writeText = (path: string, text: string) => writeFile(join(directory, path), text);

  const runCommit = (message: string) => {
    runGit('add', '-A');
    runGit('commit', '-q', '-m', message);
  };

  const run = (...args: readonly string[]) =>
    spawnSync('bash', [scriptPath, ...args], { cwd: directory, env, encoding: 'utf8' });

  // Runs the script as a GitHub Actions pull-request run against a base branch on origin, in the
  // test repository or in a clone of it.
  const runInPullRequest = (baseRef: string, args: readonly string[], cwd = directory) =>
    spawnSync('bash', [scriptPath, ...args], {
      cwd,
      env: { ...env, GITHUB_BASE_REF: baseRef },
      encoding: 'utf8',
    });

  const createOrigin = async () => {
    const originDir = await mkdtemp(join(tmpdir(), 'check-prose-origin-'));

    onTestFinished(() => rm(originDir, { recursive: true, force: true }));
    spawnSync('git', ['init', '-q', '--bare'], { cwd: originDir, env });
    runGit('remote', 'add', 'origin', originDir);

    return originDir;
  };

  // Clones one branch of origin with no history, as actions/checkout does for a pull request.
  const createShallowClone = async (originDir: string, branch: string) => {
    const cloneDir = await mkdtemp(join(tmpdir(), 'check-prose-clone-'));

    onTestFinished(() => rm(cloneDir, { recursive: true, force: true }));

    spawnSync(
      'git',
      ['clone', '-q', '--depth', '1', '--branch', branch, `file://${originDir}`, cloneDir],
      { env },
    );

    return cloneDir;
  };

  return {
    runGit,
    writeText,
    runCommit,
    run,
    runInPullRequest,
    createOrigin,
    createShallowClone,
  };
}

test('it fails on a 251-word paragraph', async () => {
  const ctx = await setupTest();

  await ctx.writeText(
    'guide.md',
    `# Guide\n\n${'word word word word word word word word word word\n'.repeat(25)}word\n`,
  );

  const result = ctx.run('guide.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('Paragraphs over 250 words in a changed file');
  expect(result.stdout).toInclude('guide.md:3:251 words');
});

test('it warns and passes on a 151-word paragraph', async () => {
  const ctx = await setupTest();

  await ctx.writeText('guide.md', `# Guide\n\n${'word '.repeat(151)}\n`);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).toInclude('Paragraphs over 150 words in a changed file (warning');
  expect(result.stdout).toInclude('guide.md:3:151 words');
});

test('it passes a 300-word fenced code block', async () => {
  const ctx = await setupTest();

  await ctx.writeText(
    'guide.md',
    `# Guide\n\n\`\`\`text\n${'word word word word word word word word word word\n'.repeat(30)}\`\`\`\n`,
  );

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('Paragraphs over');
});

test('it passes a long list, its wrapped lines and its later paragraphs', async () => {
  const ctx = await setupTest();

  const item = `- The first item.\n${'  word word word word word word word word word word\n'.repeat(30)}`;
  const step = `1. The first step.\n\n${'   word word word word word word word word word word\n'.repeat(30)}`;

  await ctx.writeText('guide.md', `# Guide\n\n${item}${item}\n${step}`);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('Paragraphs over');
});

// Each row holds a document, its exit status and the long paragraphs reported. Later rows follow
// the spec sections, one per block rule and edge.
test.each<[string, string, number, string[]]>([
  ['a 250-word paragraph', `${'word '.repeat(250)}\n`, 0, ['guide.md:1:250 words']],
  ['a 150-word paragraph', `${'word '.repeat(150)}\n`, 0, []],
  [
    'a long table, block quote and frontmatter',
    `---\ndescription: ${'word '.repeat(300)}\n---\n\n| Name |\n| ---- |\n| ${'word '.repeat(300)}|\n\n${'> word word word word word word word word word word\n'.repeat(30)}`,
    0,
    [],
  ],
  ['a block quote with a lazy line', `> A quote.\n${'word '.repeat(300)}\n`, 0, []],
  [
    'prose up to a list that interrupts it',
    `${'word '.repeat(200)}\n- ${'word '.repeat(200)}\n`,
    0,
    ['guide.md:1:200 words'],
  ],
  [
    'a table without outer pipes',
    `Name | Description\n--- | ---\n${'word '.repeat(150)}| ${'word '.repeat(150)}\n`,
    0,
    [],
  ],
  [
    'prose above a table header',
    `${'word '.repeat(200)}\nName | Description\n--- | ---\n${'word '.repeat(150)}| ${'word '.repeat(150)}\n`,
    0,
    ['guide.md:1:200 words'],
  ],
  [
    'an HTML comment and an upper-case pre block across blank lines',
    `<!--\n\n${'word '.repeat(300)}\n\n-->\n\n<PRE>\n\n${'word '.repeat(300)}\n\n</PRE>\n\n${'word '.repeat(200)}\n`,
    0,
    ['guide.md:13:200 words'],
  ],
  [
    'an HTML comment right after a list item',
    `- An item.\n<!--\n\n${'word '.repeat(300)}\n\n-->\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:7:251 words'],
  ],
  [
    'an HTML comment right after indented code',
    `Intro.\n\n    const answer = 42;\n<!--\n\n${'word '.repeat(300)}\n\n-->\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:9:251 words'],
  ],
  [
    'an HTML comment marker in indented code',
    `    <!--\n\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words'],
  ],
  [
    'paragraphs right after an HTML comment closes',
    `<!--\nA note for editors.\n-->\n${'word '.repeat(251)}\n\n<!-- A one-line note. -->\n${'word '.repeat(252)}\n`,
    1,
    ['guide.md:4:251 words', 'guide.md:7:252 words'],
  ],
  ['an empty HTML comment', `<!-->\n${'word '.repeat(251)}\n`, 1, ['guide.md:2:251 words']],
  [
    'a processing instruction',
    `<?php\n\n${'word '.repeat(300)}\n\n?>\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:6:251 words'],
  ],
  [
    'a declaration',
    `<!DOCTYPE\n\n${'word '.repeat(300)}\n\n>\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:6:251 words'],
  ],
  [
    'a CDATA section',
    `<![CDATA[\n\n${'word '.repeat(300)}\n\n]]>\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:6:251 words'],
  ],
  [
    'a script block with attributes',
    `<script type="text/x">\n\n${'word '.repeat(300)}\n\n</script>\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:6:251 words'],
  ],
  [
    'a tag whose name only starts with pre',
    `<preview>Text</preview>\n\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words'],
  ],
  [
    'a block tag that a blank line ends',
    `<div>\n${'word '.repeat(300)}\n\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:4:251 words'],
  ],
  [
    'a lone tag that a blank line ends',
    `<span>\n${'word '.repeat(300)}\n\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:4:251 words'],
  ],
  [
    'a lone tag inside a paragraph',
    `${'word '.repeat(200)}\n<span>\n${'word '.repeat(100)}\n`,
    1,
    ['guide.md:1:301 words'],
  ],
  [
    'paragraphs that start with an inline tag or an autolink',
    `<https://example.com> ${'word '.repeat(250)}\n\n<em>Read this</em> ${'word '.repeat(249)}\n`,
    1,
    ['guide.md:1:251 words', 'guide.md:3:251 words'],
  ],
  [
    'a paragraph right after a link definition',
    `[ref]: https://example.com\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:2:251 words'],
  ],
  [
    'a link definition with its title on the next line',
    `[ref]: https://example.com\n"The title"\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words'],
  ],
  [
    'a bracketed label that is not a link definition',
    `[Note]: ${'word '.repeat(250)}\n`,
    1,
    ['guide.md:1:251 words'],
  ],
  [
    'a paragraph right after a heading',
    `# Guide\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:2:251 words'],
  ],
  ['a line of seven hashes', `####### ${'word '.repeat(250)}\n`, 1, ['guide.md:1:251 words']],
  [
    'a long Setext heading',
    `${'word word word word word word word word word word\n'.repeat(26)}===\n\n${'word word word word word word word word word word\n'.repeat(26)}------\n`,
    0,
    [],
  ],
  [
    'a thematic break between paragraphs',
    `${'word '.repeat(200)}\n***\n${'word '.repeat(200)}\n`,
    0,
    ['guide.md:1:200 words', 'guide.md:3:200 words'],
  ],
  [
    'a wrapped line that starts with a number other than 1',
    `${'word '.repeat(200)}\n2024. ${'word '.repeat(100)}\n`,
    1,
    ['guide.md:1:301 words'],
  ],
  [
    'an indented line inside a paragraph',
    `${'word '.repeat(200)}\n    ${'word '.repeat(100)}\n`,
    1,
    ['guide.md:1:300 words'],
  ],
  [
    'a paragraph indented by three spaces',
    `   ${'word '.repeat(251)}\n`,
    1,
    ['guide.md:1:251 words'],
  ],
  ['a lazy line of a list item', `- ${'word '.repeat(100)}\n${'word '.repeat(200)}\n`, 0, []],
  [
    'a paragraph after a list and a blank line',
    `- An item.\n\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words'],
  ],
  [
    'a nested list with a deeper paragraph',
    `- One.\n  - Two.\n\n    ${'word '.repeat(300)}\n`,
    0,
    [],
  ],
  [
    'a paragraph after a fence left open in a list item',
    `- An item.\n  \`\`\`text\n  code\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:4:251 words'],
  ],

  // CommonMark 4.1, thematic breaks.
  [
    'a thematic break of spaced hyphens between paragraphs',
    `${'word '.repeat(200)}\n- - -\n${'word '.repeat(200)}\n`,
    0,
    ['guide.md:1:200 words', 'guide.md:3:200 words'],
  ],
  [
    'a thematic break of underscores between paragraphs',
    `${'word '.repeat(200)}\n___\n${'word '.repeat(200)}\n`,
    0,
    ['guide.md:1:200 words', 'guide.md:3:200 words'],
  ],

  // CommonMark 4.2, ATX headings.
  [
    'an ATX heading that interrupts a paragraph',
    `${'word '.repeat(200)}\n## Heading\n${'word '.repeat(200)}\n`,
    0,
    ['guide.md:1:200 words', 'guide.md:3:200 words'],
  ],
  [
    'a hash with no space after it',
    `#hashtag ${'word '.repeat(250)}\n`,
    1,
    ['guide.md:1:251 words'],
  ],
  [
    'an ATX heading indented four columns inside a paragraph',
    `${'word '.repeat(200)}\n    # Not a heading\n`,
    0,
    ['guide.md:1:204 words'],
  ],

  // CommonMark 4.3, Setext headings.
  [
    'a Setext underline with inner spaces',
    `${'word '.repeat(200)}\n= =\n${'word '.repeat(100)}\n`,
    1,
    ['guide.md:1:302 words'],
  ],
  [
    'a Setext underline indented four columns',
    `${'word '.repeat(250)}\n    ===\n`,
    1,
    ['guide.md:1:251 words'],
  ],
  [
    'an underline under a paragraph of link definitions alone',
    `[ref]: /guide\n===\n${'word '.repeat(250)}\n`,
    1,
    ['guide.md:2:251 words'],
  ],
  [
    'a paragraph right after a Setext heading',
    `Heading\n===\n${'word '.repeat(250)}\n`,
    0,
    ['guide.md:3:250 words'],
  ],

  // CommonMark 4.4, indented code blocks.
  [
    'an HTML comment marker in tab-indented code',
    `\t<!--\n\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words'],
  ],
  [
    'indented code after a paragraph and a blank line',
    `Intro.\n\n    ${'word '.repeat(300)}\n`,
    0,
    [],
  ],
  [
    'a fence marker in indented code',
    `Intro.\n\n    \`\`\`\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:4:251 words'],
  ],

  // CommonMark 4.5, fenced code blocks.
  [
    'a tilde fence',
    `~~~\n${'word '.repeat(300)}\n~~~\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:4:251 words'],
  ],
  [
    'a fence that a shorter marker leaves open',
    `\`\`\`\`\n${'word '.repeat(300)}\n\`\`\`\n${'word '.repeat(300)}\n\`\`\`\`\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:6:251 words'],
  ],
  [
    'a fence that a closer indented four columns leaves open',
    `\`\`\`\n${'word '.repeat(300)}\n    \`\`\`\n${'word '.repeat(300)}\n\`\`\`\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:6:251 words'],
  ],
  [
    'a tilde fence that backticks leave open',
    `~~~\n${'word '.repeat(300)}\n\`\`\`\n${'word '.repeat(300)}\n~~~\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:6:251 words'],
  ],
  [
    'a backtick fence whose info string holds a backtick',
    `\`\`\` a\`b ${'word '.repeat(250)}\n`,
    1,
    ['guide.md:1:252 words'],
  ],
  ['a fence left open to the end of the file', `\`\`\`text\n${'word '.repeat(300)}\n`, 0, []],
  [
    'a fence that interrupts a paragraph',
    `${'word '.repeat(200)}\n\`\`\`text\n${'word '.repeat(300)}\n\`\`\`\n`,
    0,
    ['guide.md:1:200 words'],
  ],

  // CommonMark 4.6, HTML blocks.
  [
    'lower-case cdata, which starts no HTML block',
    `<![cdata[\n\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words'],
  ],
  [
    'a lone open tag with valid attributes',
    `<a href="/guide" title='Guide' hidden>\n${'word '.repeat(300)}\n\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:4:251 words'],
  ],
  [
    'a lone tag with an invalid attribute',
    `<span invalid=>\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:1:253 words'],
  ],
  [
    'a lone closing tag',
    `</span>\n${'word '.repeat(300)}\n\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:4:251 words'],
  ],
  [
    'a lone closing pre tag, which starts no HTML block',
    `</pre>\n${'word '.repeat(250)}\n`,
    1,
    ['guide.md:1:251 words'],
  ],
  [
    'a block tag that interrupts a paragraph',
    `${'word '.repeat(200)}\n<div>\n${'word '.repeat(300)}\n\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:5:251 words', 'guide.md:1:200 words'],
  ],
  [
    'a pre block that another raw-text closing tag ends',
    `<pre>\n\n${'word '.repeat(300)}\n</style>\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:5:251 words'],
  ],
  [
    'a declaration closed on its own line',
    `<!doctype html>\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:2:251 words'],
  ],
  [
    'a processing instruction that closes inside its own opener',
    `<?>\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:2:251 words'],
  ],
  [
    'a block tag in a file with CRLF line endings',
    `<div>\r\n\r\n${'word '.repeat(251)}\r\n`,
    1,
    ['guide.md:3:251 words'],
  ],

  // CommonMark 4.7, link reference definitions.
  [
    'a link definition with a single-quoted title',
    `[ref]: /guide '${'word '.repeat(251)}'\n`,
    0,
    [],
  ],
  [
    'a bare destination with an unclosed parenthesis',
    `[ref]: /guide( '${'word '.repeat(251)}'\n`,
    1,
    ['guide.md:1:254 words'],
  ],
  [
    'a bare destination with balanced parentheses',
    `[ref]: /guide(a) '${'word '.repeat(251)}'\n`,
    0,
    [],
  ],
  [
    'a bare destination with an escaped parenthesis',
    `[ref]: /guide\\( '${'word '.repeat(251)}'\n`,
    0,
    [],
  ],
  [
    'a single-quoted title on the next line',
    `[ref]: /guide\n'The title'\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words'],
  ],
  [
    'a parenthesized title',
    `[ref]: /guide (The title)\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:2:251 words'],
  ],
  [
    'a title that spans lines',
    `[ref]: /guide '\nThe title\nruns on\n'\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:5:251 words'],
  ],
  [
    'a title that a blank line breaks',
    `[ref]: /guide 'The title ${'word '.repeat(250)}\n\nends here.'\n`,
    1,
    ['guide.md:1:254 words'],
  ],
  [
    'a destination on the next line',
    `[ref]:\n/guide\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words'],
  ],
  [
    'an angle-bracket destination with a space',
    `[ref]: <my guide.md> "Title"\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:2:251 words'],
  ],
  [
    'an empty label, which makes no link definition',
    `[]: /guide\n${'word '.repeat(250)}\n`,
    1,
    ['guide.md:1:252 words'],
  ],
  [
    'a link definition inside a paragraph',
    `${'word '.repeat(200)}\n[ref]: /guide\n${'word '.repeat(100)}\n`,
    1,
    ['guide.md:1:302 words'],
  ],
  [
    'an invalid title on the line after a definition',
    `[ref]: /guide\n"The title" ${'word '.repeat(250)}\n`,
    1,
    ['guide.md:2:252 words'],
  ],
  [
    'link definitions in a row',
    `[a]: /a\n[b]: /b 'B'\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words'],
  ],
  [
    'a label that spans lines',
    `[my\nref]: /guide\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words'],
  ],
  [
    'a label of 999 characters',
    `[${'a'.repeat(999)}]: /guide\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:2:251 words'],
  ],
  [
    'a label of 1000 characters, which makes no link definition',
    `[${'a'.repeat(1000)}]: /guide\n${'word '.repeat(250)}\n`,
    1,
    ['guide.md:1:252 words'],
  ],

  // GFM 4.10, tables.
  [
    'a delimiter row with a different cell count',
    `a | b\n--- | --- | ---\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:1:259 words'],
  ],
  [
    'a table that a heading ends',
    `a | b\n--- | ---\nrow | row\n# Heading\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:5:251 words'],
  ],
  [
    'a table that a blank line ends',
    `a | b\n--- | ---\nrow | row\n\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:5:251 words'],
  ],
  ['a table row with no pipes', `a | b\n--- | ---\n${'word '.repeat(300)}\n`, 0, []],
  ['an escaped pipe in a table header', `a \\| b | c\n--- | ---\n${'word '.repeat(300)}\n`, 0, []],

  // CommonMark 5.1, block quotes.
  [
    'an unmarked line after a quoted heading',
    `> # Heading\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:2:251 words'],
  ],
  [
    'an unmarked line after quoted fenced code',
    `> \`\`\`\n> code\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words'],
  ],
  [
    'an unmarked line after quoted indented code',
    `>     code\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:2:251 words'],
  ],
  [
    'an unmarked line after code that a tab after the quote marker indents',
    `>\t\tcode\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:2:251 words'],
  ],
  [
    'a thematic break right after a quote',
    `> A quote.\n***\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words'],
  ],
  [
    'a line of hyphens after a quote, which is a thematic break and no underline',
    `> A quote.\n---\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words'],
  ],
  [
    'an unmarked line after a heading in a quoted list item',
    `> - # Heading\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:2:251 words'],
  ],
  [
    'an unmarked line after a quoted list and a blank quoted line',
    `> - One.\n>\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words'],
  ],
  [
    'a deeper paragraph of a list inside a quote',
    `> - One.\n>\n>   ${'word '.repeat(300)}\n`,
    0,
    [],
  ],
  ['a lazy line after a quote inside a list item', `- > A quote.\n${'word '.repeat(300)}\n`, 0, []],
  [
    'a paragraph after a quote inside a list item and a blank line',
    `- > A quote.\n\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words'],
  ],
  [
    'a column-0 paragraph after a quote, a blank line and a quoted line',
    `> A quote.\n\n> More.\n\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:5:251 words'],
  ],
  [
    'a blank line after a quote',
    `> A quote.\n\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words'],
  ],
  ['a lazy line after a nested quote', `> > A quote.\n${'word '.repeat(300)}\n`, 0, []],
  ['a lazy line after a quoted list item', `> - An item.\n${'word '.repeat(300)}\n`, 0, []],
  [
    'a quote that interrupts a paragraph',
    `${'word '.repeat(200)}\n> A quote.\n`,
    0,
    ['guide.md:1:200 words'],
  ],

  // CommonMark 5.2 and 5.3, list items and lists.
  [
    'an empty item, which cannot interrupt a paragraph',
    `${'word '.repeat(200)}\n*\n${'word '.repeat(100)}\n`,
    1,
    ['guide.md:1:301 words'],
  ],
  [
    'an ordered item numbered 1 that interrupts a paragraph',
    `${'word '.repeat(200)}\n1. ${'word '.repeat(200)}\n`,
    0,
    ['guide.md:1:200 words'],
  ],
  [
    'a ten-digit ordered marker',
    `1234567890. ${'word '.repeat(250)}\n`,
    1,
    ['guide.md:1:251 words'],
  ],
  [
    'an item whose content starts as indented code',
    `-     <!--\n\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words'],
  ],
  [
    'an empty item followed by a blank line',
    `-\n\n  ${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words'],
  ],
  [
    'a paragraph indented less than a tab-padded item',
    `-\tAn item.\n\n  ${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words'],
  ],
  ['a tab-indented paragraph of a list item', `- An item.\n\n\t${'word '.repeat(300)}\n`, 0, []],
  [
    'a paragraph indented less than an ordered item',
    `1. An item.\n\n  ${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words'],
  ],
  [
    'a paragraph indented less than a wide ordered item',
    `10.  An item.\n\n   ${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words'],
  ],
  ['a paragraph of a wide ordered item', `10.  An item.\n\n     ${'word '.repeat(300)}\n`, 0, []],
  [
    'a paragraph back at the outer item of a nested list',
    `- One.\n  - Two.\n\n  ${'word '.repeat(300)}\n`,
    0,
    [],
  ],
  [
    'a paragraph after a sibling item that ends a nested list',
    `- One.\n  - Two.\n- Three.\n\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:5:251 words'],
  ],
  [
    'a paragraph after an item that interrupts a paragraph and holds an empty item',
    `${'word '.repeat(200)}\n- -\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:3:251 words', 'guide.md:1:200 words'],
  ],
  [
    'a column-0 paragraph after a list, a blank line and an indented line',
    `- An item.\n\n  More.\n\n${'word '.repeat(251)}\n`,
    1,
    ['guide.md:5:251 words'],
  ],
  ['an item whose content starts on the next line', `-\n  ${'word '.repeat(300)}\n`, 0, []],
  ['an item marker indented four columns', `    - ${'word '.repeat(300)}\n`, 0, []],
])('it reports the long paragraphs in %s', async (_label, text, status, reported) => {
  const ctx = await setupTest();

  await ctx.writeText('guide.md', text);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(status);

  expect(result.stdout.split('\n').filter((line) => line.endsWith(' words'))).toStrictEqual(
    reported,
  );
});

test('it keeps a separate paragraph count for each changed file', async () => {
  const ctx = await setupTest();

  await ctx.writeText('first.md', `${'word '.repeat(150)}\n`);
  await ctx.writeText('second.md', `${'word '.repeat(150)}\n`);

  const result = ctx.run('first.md', 'second.md');

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('Paragraphs over');
});

test('it ends a list and an open HTML comment at the end of their file', async () => {
  const ctx = await setupTest();

  await ctx.writeText('first.md', '- An item.\n<!--\n');
  await ctx.writeText('second.md', `${'word '.repeat(251)}\n`);

  const result = ctx.run('first.md', 'second.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('second.md:1:251 words');
});

test('it skips a file the branch leaves unchanged since its base on origin', async () => {
  const ctx = await setupTest();

  await ctx.writeText('old.md', `${'word '.repeat(300)}\n`);

  ctx.runCommit('add the old doc');
  ctx.runGit('update-ref', 'refs/remotes/origin/main', 'HEAD');

  await ctx.writeText('new.md', `${'word '.repeat(260)}\n`);

  ctx.runCommit('add the new doc');

  const result = ctx.run('old.md', 'new.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('new.md:1:260 words');
  expect(result.stdout).not.toInclude('old.md');
  expect(result.stderr).not.toInclude('no merge base');
});

test('it checks uncommitted edits and says so when origin has no base', async () => {
  const ctx = await setupTest();

  await ctx.writeText('old.md', `${'word '.repeat(300)}\n`);
  await ctx.writeText('edited.md', 'A short doc.\n');

  ctx.runCommit('add the docs');

  await ctx.writeText('edited.md', `${'word '.repeat(260)}\n`);

  const result = ctx.run('old.md', 'edited.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('edited.md:1:260 words');
  expect(result.stdout).not.toInclude('old.md');

  expect(result.stderr).toInclude(
    'no merge base with origin/main, so the paragraph check reads only uncommitted files',
  );
});

test('it checks a staged file before the first commit', async () => {
  const ctx = await setupTest();

  await ctx.writeText('guide.md', `${'word '.repeat(251)}\n`);

  ctx.runGit('add', 'guide.md');

  const result = ctx.run('guide.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('guide.md:1:251 words');
});

test('it fetches the base branch in a pull-request run with no origin history', async () => {
  const ctx = await setupTest();

  await ctx.writeText('old.md', `${'word '.repeat(300)}\n`);

  ctx.runCommit('add the old doc');

  await ctx.createOrigin();

  ctx.runGit('push', '-q', 'origin', 'HEAD:main');
  ctx.runGit('update-ref', '-d', 'refs/remotes/origin/main');

  await ctx.writeText('new.md', `${'word '.repeat(260)}\n`);

  ctx.runCommit('add the new doc');

  const result = ctx.runInPullRequest('main', ['old.md', 'new.md']);

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('new.md:1:260 words');
  expect(result.stdout).not.toInclude('old.md');
  expect(result.stderr).not.toInclude('no merge base');
});

test('it counts only the PR documents in a shallow pull-request merge checkout', async () => {
  const ctx = await setupTest();

  await ctx.writeText('readme.md', 'A short doc.\n');

  ctx.runCommit('add the readme');
  ctx.runGit('branch', '-M', 'main');
  ctx.runGit('branch', 'feature');

  await ctx.writeText('base.md', `${'word '.repeat(260)}\n`);

  ctx.runCommit('add a doc on the base');
  ctx.runGit('checkout', '-q', 'feature');

  await ctx.writeText('pr.md', `${'word '.repeat(270)}\n`);

  ctx.runCommit('add a doc on the PR');
  ctx.runGit('checkout', '-q', '-b', 'pull-merge', 'main');
  ctx.runGit('merge', '-q', '--no-edit', 'feature');

  const originDir = await ctx.createOrigin();

  ctx.runGit('push', '-q', 'origin', 'main', 'pull-merge');

  const cloneDir = await ctx.createShallowClone(originDir, 'pull-merge');

  const result = ctx.runInPullRequest('main', ['base.md', 'pr.md'], cloneDir);

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('pr.md:1:270 words');
  expect(result.stdout).not.toInclude('base.md');
});

test('it checks a changed file whose name holds a space', async () => {
  const ctx = await setupTest();

  await ctx.writeText('user guide.md', `${'word '.repeat(251)}\n`);

  const result = ctx.run('user guide.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('user guide.md:1:251 words');
});

test('it checks a changed file whose name holds an equals sign', async () => {
  const ctx = await setupTest();

  await ctx.writeText('mode=fast.md', `${'word '.repeat(251)}\n`);

  const result = ctx.run('mode=fast.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('mode=fast.md:1:251 words');
});

test('it checks a changed file whose name starts with a dash', async () => {
  const ctx = await setupTest();

  await ctx.writeText('-guide.md', `${'word '.repeat(251)}\n`);

  const result = ctx.run('-guide.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('-guide.md:1:251 words');
});

test('it reports a unit joined to its number in files named with an equals sign, a dash or a space', async () => {
  const ctx = await setupTest();

  await ctx.writeText('mode=fast.md', 'The cache holds 64KB.\n');
  await ctx.writeText('-guide.md', 'The cache holds 64KB.\n');
  await ctx.writeText('user guide.md', 'The cache holds 64KB.\n');

  const result = ctx.run('mode=fast.md', '-guide.md', 'user guide.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('mode=fast.md:1:The cache holds 64KB.');
  expect(result.stdout).toInclude('-guide.md:1:The cache holds 64KB.');
  expect(result.stdout).toInclude('user guide.md:1:The cache holds 64KB.');
});

test('it passes a banned word in a code span or a code block', async () => {
  const ctx = await setupTest();

  await ctx.writeText(
    'guide.md',
    '# Guide\n\nRun the `lint-seams` check.\n\n```text\nlint-seams --all\n```\n\n~~~text\nseams\n~~~\n',
  );

  const result = ctx.run('guide.md');

  expect(result.status).toBe(0);
  expect(result.stdout).not.toInclude('Banned words');
});

test('it reports a banned word in prose beside a code span', async () => {
  const ctx = await setupTest();

  await ctx.writeText('guide.md', '# Guide\n\nThe `lint` check covers the seams.\n');

  const result = ctx.run('guide.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('Banned words');
  expect(result.stdout).toInclude('guide.md:3:The `lint` check covers the seams.');
});

test('it reports a banned word in a code span outside Markdown', async () => {
  const ctx = await setupTest();

  await ctx.writeText('notes.txt', 'Run the `lint-seams` check.\n');

  const result = ctx.run('notes.txt');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('notes.txt:1:Run the `lint-seams` check.');
});

test.each<[string, string, number]>([
  ['an uppercase CAS', 'The store does a CAS on each write.\n', 1],
  ['a plural CAs', 'The cluster trusts two CAs.\n', 0],
  ['a code fence', 'Close each code fence.\n', 0],
  ['a Surface in any case', 'The Surface grows.\n', 1],
])('it checks %s in Markdown prose', async (_name, text, status) => {
  const ctx = await setupTest();

  await ctx.writeText('guide.md', text);

  const result = ctx.run('guide.md');

  expect(result.status).toBe(status);
});

test('it reads the default branch from origin/HEAD', async () => {
  const ctx = await setupTest();

  await ctx.writeText('old.md', `${'word '.repeat(300)}\n`);

  ctx.runCommit('add the old doc');
  ctx.runGit('update-ref', 'refs/remotes/origin/trunk', 'HEAD');
  ctx.runGit('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');

  await ctx.writeText('new.md', `${'word '.repeat(251)}\n`);

  ctx.runCommit('add the new doc');

  const result = ctx.run('old.md', 'new.md');

  expect(result.status).toBe(1);
  expect(result.stdout).toInclude('new.md:1:251 words');
  expect(result.stdout).not.toInclude('old.md');
});
