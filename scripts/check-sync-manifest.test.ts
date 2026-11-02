import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';
import { writeTreeFiles } from '../test-utils/write-tree-files.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'check-sync-manifest-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const scriptPath = fileURLToPath(new URL('check-sync-manifest.sh', import.meta.url));

  return { directory, scriptPath };
}

test('it fails when a zgeoff/skills folder holds a file its entry omits', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'tree/skills/kettle/SKILL.md': '# Kettle\n',
    'tree/skills/kettle/references/descaling.md': '# Descaling\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-kettle',
        description: 'The kettle skill',
        files: [
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/SKILL.md',
            target: '.claude/skills/kettle/SKILL.md',
          },
        ],
      },
    ]),
  });

  const result = await $`bash ${ctx.scriptPath} sync/manifest.json tree`
    .cwd(ctx.directory)
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr:
      "check-sync-manifest: entry 'skill-kettle' ships skills/kettle/ of zgeoff/skills, but omits skills/kettle/references/descaling.md\n",
  });
});

test('it fails when two entries split one zgeoff/skills folder between them', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'tree/skills/kettle/SKILL.md': '# Kettle\n',
    'tree/skills/kettle/references/descaling.md': '# Descaling\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-kettle',
        description: 'The kettle skill',
        files: [
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/SKILL.md',
            target: '.claude/skills/kettle/SKILL.md',
          },
        ],
      },
      {
        name: 'skill-kettle-descaling',
        description: 'The kettle skill descaling reference',
        files: [
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/references/descaling.md',
            target: '.claude/skills/kettle/references/descaling.md',
          },
        ],
      },
    ]),
  });

  const result = await $`bash ${ctx.scriptPath} sync/manifest.json tree`
    .cwd(ctx.directory)
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr:
      "check-sync-manifest: entry 'skill-kettle-descaling' ships skills/kettle/ of zgeoff/skills, but omits skills/kettle/SKILL.md\ncheck-sync-manifest: entry 'skill-kettle' ships skills/kettle/ of zgeoff/skills, but omits skills/kettle/references/descaling.md\n",
  });
});

test('it passes when each entry lists every file of its zgeoff/skills folder but the tests', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'tree/skills/kettle/SKILL.md': '# Kettle\n',
    'tree/skills/kettle/scripts/boil.sh': 'exit 0\n',
    'tree/skills/kettle/scripts/boil.test.ts': '',
    'tree/skills/teapot/SKILL.md': '# Teapot\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-kettle',
        description: 'The kettle skill',
        files: [
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/SKILL.md',
            target: '.claude/skills/kettle/SKILL.md',
          },
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/scripts/boil.sh',
            target: '.claude/skills/kettle/scripts/boil.sh',
          },
        ],
      },
    ]),
  });

  const result = await $`bash ${ctx.scriptPath} sync/manifest.json tree`
    .cwd(ctx.directory)
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({ exitCode: 0, stdout: '', stderr: '' });
});

test('it fails when a zgeoff/skills source is missing from the tree', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'tree/skills/kettle/SKILL.md': '# Kettle\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-kettle',
        description: 'The kettle skill',
        files: [
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/SKILL.md',
            target: '.claude/skills/kettle/SKILL.md',
          },
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/references/gone.md',
            target: '.claude/skills/kettle/references/gone.md',
          },
        ],
      },
    ]),
  });

  const result = await $`bash ${ctx.scriptPath} sync/manifest.json tree`
    .cwd(ctx.directory)
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr:
      "check-sync-manifest: entry 'skill-kettle' lists source skills/kettle/references/gone.md of zgeoff/skills, which does not exist\n",
  });
});

test('it reads zgeoff/skills from the unpacked tree of the pinned commit', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'sync/skills-pin.json': JSON.stringify({ commit: '0123456789abcdef0123456789abcdef01234567' }),
    '.zgeoff-skills/0123456789abcdef0123456789abcdef01234567/skills/kettle/SKILL.md': '# Kettle\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-kettle',
        description: 'The kettle skill',
        files: [
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/SKILL.md',
            target: '.claude/skills/kettle/SKILL.md',
          },
        ],
      },
    ]),
  });

  const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({ exitCode: 0, stdout: '', stderr: '' });
});

test('it fails and names the install command when the pinned tree is missing', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'sync/skills-pin.json': JSON.stringify({ commit: '0123456789abcdef0123456789abcdef01234567' }),
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-kettle',
        description: 'The kettle skill',
        files: [
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/SKILL.md',
            target: '.claude/skills/kettle/SKILL.md',
          },
        ],
      },
    ]),
  });

  const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr:
      "check-sync-manifest: an entry reads zgeoff/skills, but its tree '.zgeoff-skills/0123456789abcdef0123456789abcdef01234567' is missing; run bun run skills:install\n",
  });
});

test('it fails when a file names a repo the sync does not check out', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'sync/editorconfig': 'root = true\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'editorconfig',
        description: 'The editor config',
        files: [{ repo: 'acme/kettle', source: 'sync/editorconfig', target: '.editorconfig' }],
      },
    ]),
  });

  const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr:
      'check-sync-manifest: entry \'editorconfig\' gives sync/editorconfig the repo "acme/kettle", which is neither zgeoff/tools nor zgeoff/skills\n',
  });
});

test('it fails when a Markdown file links an excepted file outside a block', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'sync/skills/demo/references'), { recursive: true });

  await writeFile(
    join(ctx.directory, 'sync/skills/demo/SKILL.md'),
    '# Demo\n\nFor Rust, read [Rust](./references/rust.md).\n',
  );

  await writeFile(join(ctx.directory, 'sync/skills/demo/references/rust.md'), '# Rust\n');

  await writeFile(
    join(ctx.directory, 'sync/manifest.json'),
    JSON.stringify([
      {
        name: 'skill-demo',
        description: 'The demo skill',
        files: [
          { source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' },
          {
            source: 'sync/skills/demo/references/rust.md',
            target: '.claude/skills/demo/references/rust.md',
            except: ['acme/ledger'],
          },
        ],
      },
    ]),
  );

  const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr:
      "check-sync-manifest: entry 'skill-demo' links ./references/rust.md from sync/skills/demo/SKILL.md outside a 'repo-sync needs ./references/rust.md' block, so acme/ledger gets a dead link\n",
  });
});

test('it passes when every link to an excepted file sits in a block that needs it', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'sync/skills/demo/references'), { recursive: true });

  await writeFile(
    join(ctx.directory, 'sync/skills/demo/SKILL.md'),
    '# Demo\n\n' +
      '<!-- repo-sync needs ./references/rust.md -->\n\n' +
      'For Rust, read [Rust](./references/rust.md).\n\n' +
      '<!-- repo-sync end -->\n',
  );

  await writeFile(join(ctx.directory, 'sync/skills/demo/references/rust.md'), '# Rust\n');

  await writeFile(
    join(ctx.directory, 'sync/manifest.json'),
    JSON.stringify([
      {
        name: 'skill-demo',
        description: 'The demo skill',
        files: [
          { source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' },
          {
            source: 'sync/skills/demo/references/rust.md',
            target: '.claude/skills/demo/references/rust.md',
            except: ['acme/ledger'],
          },
        ],
      },
    ]),
  );

  const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: '',
    stderr: '',
  });
});

test('it fails when an except holds a value that is not an owner/repo name', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'sync'));
  await writeFile(join(ctx.directory, 'demo.md'), '# Demo\n');

  await writeFile(
    join(ctx.directory, 'sync/manifest.json'),
    JSON.stringify([
      {
        name: 'demo',
        description: 'The demo file',
        files: [{ source: 'demo.md', target: 'demo.md', except: ['ledger'] }],
      },
    ]),
  );

  const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr:
      "check-sync-manifest: entry 'demo' gives demo.md an except that is not a list of owner/repo names\n",
  });
});

test('it fails on a link that only one excepted repo loses its block for', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'sync/skills/demo/references'), { recursive: true });

  await writeFile(
    join(ctx.directory, 'sync/skills/demo/SKILL.md'),
    '# Demo\n\n' +
      '<!-- repo-sync needs ./references/kotlin.md -->\n\n' +
      'Read [Kotlin](./references/kotlin.md) beside [Rust](./references/rust.md).\n\n' +
      '<!-- repo-sync end -->\n',
  );

  await writeFile(join(ctx.directory, 'sync/skills/demo/references/kotlin.md'), '# Kotlin\n');
  await writeFile(join(ctx.directory, 'sync/skills/demo/references/rust.md'), '# Rust\n');

  await writeFile(
    join(ctx.directory, 'sync/manifest.json'),
    JSON.stringify([
      {
        name: 'skill-demo',
        description: 'The demo skill',
        files: [
          { source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' },
          {
            source: 'sync/skills/demo/references/kotlin.md',
            target: '.claude/skills/demo/references/kotlin.md',
            except: ['acme/storefront'],
          },
          {
            source: 'sync/skills/demo/references/rust.md',
            target: '.claude/skills/demo/references/rust.md',
            except: ['acme/ledger'],
          },
        ],
      },
    ]),
  );

  const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr:
      "check-sync-manifest: entry 'skill-demo' links ./references/rust.md from sync/skills/demo/SKILL.md outside a 'repo-sync needs ./references/rust.md' block, so acme/ledger gets a dead link\n",
  });
});

test('it passes when an excepted Markdown file links another file the same repo skips', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'sync/skills/demo/references'), { recursive: true });
  await writeFile(join(ctx.directory, 'sync/skills/demo/SKILL.md'), '# Demo\n');

  await writeFile(
    join(ctx.directory, 'sync/skills/demo/references/kotlin.md'),
    '# Kotlin\n\nCompare [Rust](./rust.md).\n',
  );

  await writeFile(join(ctx.directory, 'sync/skills/demo/references/rust.md'), '# Rust\n');

  await writeFile(
    join(ctx.directory, 'sync/manifest.json'),
    JSON.stringify([
      {
        name: 'skill-demo',
        description: 'The demo skill',
        files: [
          { source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' },
          {
            source: 'sync/skills/demo/references/kotlin.md',
            target: '.claude/skills/demo/references/kotlin.md',
            except: ['acme/ledger'],
          },
          {
            source: 'sync/skills/demo/references/rust.md',
            target: '.claude/skills/demo/references/rust.md',
            except: ['acme/ledger'],
          },
        ],
      },
    ]),
  );

  const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: '',
    stderr: '',
  });
});

test.each([
  {
    part: 'key that the scripts field does not declare',
    scripts: { 'check:spelling': 'cspell .' },
    written: '{"check:spelling": "cspell .", "check:links": "lychee ."}',
    problem:
      'has a build that writes script "check:links" as "lychee .", which its scripts field does not declare',
  },
  {
    part: 'value that the scripts field does not declare',
    scripts: { 'check:spelling': 'cspell .' },
    written: '{"check:spelling": "cspell --no-progress ."}',
    problem:
      'declares script "check:spelling" as "cspell .", but its build writes "cspell --no-progress ."',
  },
  {
    part: 'key for an entry with no scripts field',
    scripts: undefined,
    written: '{"check:spelling": "cspell ."}',
    problem:
      'has a build that writes script "check:spelling" as "cspell .", which its scripts field does not declare',
  },
])('it fails when a build writes a script $part', async (testCase) => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'sync'));

  await writeFile(
    join(ctx.directory, 'sync/manifest.json'),
    JSON.stringify([
      {
        name: 'demo',
        description: 'The demo scripts',
        files: [],
        scripts: testCase.scripts,
        build: `jq '.scripts = ${testCase.written}' package.json > package.json.tmp; mv package.json.tmp package.json`,
      },
    ]),
  );

  const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr: `check-sync-manifest: entry 'demo' ${testCase.problem}\n`,
  });
});

test('it fails when the scripts field declares a script that the build never writes', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'sync'));

  await writeFile(
    join(ctx.directory, 'sync/manifest.json'),
    JSON.stringify([
      {
        name: 'demo',
        description: 'The demo scripts',
        files: [],
        scripts: { 'check:spelling': 'cspell .', 'check:links': 'lychee .' },
        build: `jq '.scripts = {"check:spelling": "cspell ."}' package.json > package.json.tmp; mv package.json.tmp package.json`,
      },
    ]),
  );

  const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr:
      'check-sync-manifest: entry \'demo\' declares script "check:links", which its build never writes\n',
  });
});

test('it fails when an entry without a build declares scripts', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'sync'));

  await writeFile(
    join(ctx.directory, 'sync/manifest.json'),
    JSON.stringify([
      {
        name: 'demo',
        description: 'The demo scripts',
        files: [],
        scripts: { 'check:spelling': 'cspell .' },
      },
    ]),
  );

  const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr:
      'check-sync-manifest: entry \'demo\' declares script "check:spelling", which its build never writes\n',
  });
});

test('it fails when the scripts field holds a value that is not a string', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'sync'));

  await writeFile(
    join(ctx.directory, 'sync/manifest.json'),
    JSON.stringify([
      {
        name: 'demo',
        description: 'The demo scripts',
        files: [],
        scripts: { 'check:spelling': ['cspell', '.'] },
      },
    ]),
  );

  const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr:
      "check-sync-manifest: entry 'demo' has a scripts field that is not an object of strings\n",
  });
});

test.each([{ value: 'true' }, { value: 'false' }])(
  'it fails when a build leaves a scripts field of $value',
  async (testCase) => {
    const ctx = await setupTest();

    await mkdir(join(ctx.directory, 'sync'));

    await writeFile(
      join(ctx.directory, 'sync/manifest.json'),
      JSON.stringify([
        {
          name: 'demo',
          description: 'The demo scripts',
          files: [],
          build: `jq '.scripts = ${testCase.value}' package.json > package.json.tmp; mv package.json.tmp package.json`,
        },
      ]),
    );

    const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

    expect({
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }).toStrictEqual({
      exitCode: 1,
      stdout: '',
      stderr:
        "check-sync-manifest: entry 'demo' has a build that leaves package.json without a scripts object of strings\n",
    });
  },
);

test('it fails when a build fails on an empty package.json', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'sync'));

  await writeFile(
    join(ctx.directory, 'sync/manifest.json'),
    JSON.stringify([
      {
        name: 'demo',
        description: 'The demo scripts',
        files: [],
        build: 'echo "lefthook.yml is missing" >&2; exit 3',
      },
    ]),
  );

  const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr:
      "check-sync-manifest: entry 'demo' has a build that fails on an empty package.json: lefthook.yml is missing\n",
  });
});

test('it fails when the files field of an entry is not a list', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'sync'));

  await writeFile(
    join(ctx.directory, 'sync/manifest.json'),
    JSON.stringify([{ name: 'demo', description: 'The demo file', files: 'demo.md' }]),
  );

  const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr:
      'check-sync-manifest: sync/manifest.json is not a list of entries, each with a string name and a files list of string sources and targets\n',
  });
});

test.each([
  {
    field: 'name',
    entry: {
      name: 7,
      description: 'The demo file',
      files: [{ source: 'demo.md', target: 'demo.md' }],
    },
  },
  {
    field: 'source',
    entry: {
      name: 'demo',
      description: 'The demo file',
      files: [{ source: 7, target: 'demo.md' }],
    },
  },
  {
    field: 'target',
    entry: {
      name: 'demo',
      description: 'The demo file',
      files: [{ source: 'demo.md', target: 7 }],
    },
  },
])('it fails when an entry has a $field that is not a string', async (testCase) => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'sync'));
  await writeFile(join(ctx.directory, 'demo.md'), '# Demo\n');
  await writeFile(join(ctx.directory, 'sync/manifest.json'), JSON.stringify([testCase.entry]));

  const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr:
      'check-sync-manifest: sync/manifest.json is not a list of entries, each with a string name and a files list of string sources and targets\n',
  });
});

test('it passes when the scripts field declares each script the build writes, with its value', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'sync'));

  await writeFile(
    join(ctx.directory, 'sync/manifest.json'),
    JSON.stringify([
      {
        name: 'demo',
        description: 'The demo scripts',
        files: [],
        scripts: { 'check:spelling': 'cspell .', 'check:links': 'lychee "$(cat urls.txt)"' },
        build: `jq --arg links 'lychee "$(cat urls.txt)"' '.scripts = {"check:spelling": "cspell .", "check:links": $links}' package.json > package.json.tmp; mv package.json.tmp package.json`,
      },
      {
        name: 'notes',
        description: 'The notes file',
        files: [],
        build: 'touch notes.md',
      },
    ]),
  );

  const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: '',
    stderr: '',
  });
});

test('it fails when a zgeoff/skills Markdown file links an excepted file outside a block', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'tree/skills/kettle/SKILL.md': '# Kettle\n\nFor Go, read [Go](./references/go.md).\n',
    'tree/skills/kettle/references/go.md': '# Go\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-kettle',
        description: 'The kettle skill',
        files: [
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/SKILL.md',
            target: '.claude/skills/kettle/SKILL.md',
          },
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/references/go.md',
            target: '.claude/skills/kettle/references/go.md',
            except: ['acme/ledger'],
          },
        ],
      },
    ]),
  });

  const result = await $`bash ${ctx.scriptPath} sync/manifest.json tree`
    .cwd(ctx.directory)
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr:
      "check-sync-manifest: entry 'skill-kettle' links ./references/go.md from skills/kettle/SKILL.md outside a 'repo-sync needs ./references/go.md' block, so acme/ledger gets a dead link\n",
  });
});
