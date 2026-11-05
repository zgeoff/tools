import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRunFolderPrefix, writeTreeFiles } from '@zgeoff/testing/helpers';
import { $ } from 'bun';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), readRunFolderPrefix('check-sync-manifest-')));

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

test('it fails when an entry holds a key the repo-sync scripts do not read', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'sync/editorconfig': 'root = true\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'editorconfig',
        description: 'The editor config',
        files: [{ source: 'sync/editorconfig', target: '.editorconfig', ref: 'v2' }],
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
      "check-sync-manifest: entry 'editorconfig' holds files[0].ref, which the repo-sync scripts do not read\n",
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

test.each([
  { line: "import { pourTea } from '@acme/teapot';" },
  { line: "import type { Teapot } from '@acme/teapot/types';" },
  { line: "import '@acme/teapot';" },
  { line: "export { pourTea } from '@acme/teapot';" },
  { line: "const teapot = await import('@acme/teapot');" },
  { line: "const teapot = require('@acme/teapot');" },
  { line: "const teapot = await import(\n  '@acme/teapot'\n);" },
  { line: 'const teapot = await import(`@acme/teapot`);' },
  { line: 'const teapot = require(`@acme/teapot`);' },
  { line: "type Teapot = typeof import(/* the pot */ '@acme/teapot');" },
])(
  'it fails when a code source holds $line and its entry does not list the package',
  async (row) => {
    const ctx = await setupTest();

    await writeTreeFiles(ctx.directory, {
      'sync/brew.ts': `${row.line}\n`,
      'sync/manifest.json': JSON.stringify([
        {
          name: 'brew',
          description: 'The brew script',
          files: [{ source: 'sync/brew.ts', target: 'scripts/brew.ts' }],
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
        "check-sync-manifest: entry 'brew' delivers sync/brew.ts, which imports @acme/teapot, a package its packages field does not list\n",
    });
  },
);

test('it passes a code source that imports only built-in modules, relative paths and the packages its entry lists', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'sync/brew.ts': [
      "import { readFileSync } from 'node:fs';",
      "import { expect } from 'bun:test';",
      "import { $ } from 'bun';",
      "import { steep } from './steep.ts';",
      "import { pourTea } from '@acme/teapot';",
      "import { warmCup } from 'cup-warmer/sync';",
      '',
    ].join('\n'),
    'sync/steep.ts': 'export const steep = 3;\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'brew',
        description: 'The brew script',
        packages: ['@acme/teapot', 'cup-warmer'],
        files: [
          { source: 'sync/brew.ts', target: 'scripts/brew.ts' },
          { source: 'sync/steep.ts', target: 'scripts/steep.ts' },
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

test('it passes a code source whose strings name the import keywords', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'sync/brew.ts': "const keywords = ['from','import','require'];\nconst pot = `import`;\n",
    'sync/manifest.json': JSON.stringify([
      {
        name: 'brew',
        description: 'The brew script',
        files: [{ source: 'sync/brew.ts', target: 'scripts/brew.ts' }],
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

test('it passes a code source that names a package only in comments and strings', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'sync/brew.ts': [
      "// import '@acme/teapot';",
      "/* import { pourTea } from '@acme/teapot'; */",
      'const note = "import \'@acme/teapot\'";',
      "const hint = `require('@acme/teapot')`;",
      '',
    ].join('\n'),
    'sync/manifest.json': JSON.stringify([
      {
        name: 'brew',
        description: 'The brew script',
        files: [{ source: 'sync/brew.ts', target: 'scripts/brew.ts' }],
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

test.each([
  [
    'leaves out the file a relative import names',
    [{ source: 'sync/kettle/brew.ts', target: 'scripts/brew.ts' }],
    1,
    "check-sync-manifest: entry 'brew' delivers sync/kettle/brew.ts to scripts/brew.ts, which imports ../steep.ts, but the entry does not deliver sync/steep.ts to steep.ts\n",
  ],
  [
    'delivers the imported file beside another target',
    [
      { source: 'sync/kettle/brew.ts', target: 'scripts/kettle/brew.ts' },
      { source: 'sync/steep.ts', target: 'scripts/steep/steep.ts' },
    ],
    1,
    "check-sync-manifest: entry 'brew' delivers sync/kettle/brew.ts to scripts/kettle/brew.ts, which imports ../steep.ts, but the entry does not deliver sync/steep.ts to scripts/steep.ts\n",
  ],
  [
    'delivers the imported file where the import names it',
    [
      { source: 'sync/kettle/brew.ts', target: 'scripts/kettle/brew.ts' },
      { source: 'sync/steep.ts', target: 'scripts/steep.ts' },
    ],
    0,
    '',
  ],
])('it checks a relative import when the entry %s', async (_case, files, exitCode, stderr) => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'sync/kettle/brew.ts': "import { steep } from '../steep.ts';\n\nconsole.log(steep);\n",
    'sync/steep.ts': 'export const steep = 3;\n',
    'sync/manifest.json': JSON.stringify([{ name: 'brew', description: 'The brew script', files }]),
  });

  const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({ exitCode, stdout: '', stderr });
});

test.each([
  ['../steep', 'sync/steep.ts', 'scripts/steep.ts'],
  ['../leaves', 'sync/leaves/index.ts', 'scripts/leaves/index.ts'],
  ['../steep.js', 'sync/steep.ts', 'scripts/steep.ts'],
])(
  'it resolves the relative import %p to the file Bun loads, and passes when the entry delivers it',
  async (specifier, importedSource, importedTarget) => {
    const ctx = await setupTest();

    await writeTreeFiles(ctx.directory, {
      'sync/kettle/brew.ts': `import { steep } from '${specifier}';\n\nconsole.log(steep);\n`,
      [importedSource]: 'export const steep = 3;\n',
      'sync/manifest.json': JSON.stringify([
        {
          name: 'brew',
          description: 'The brew script',
          files: [
            { source: 'sync/kettle/brew.ts', target: 'scripts/kettle/brew.ts' },
            { source: importedSource, target: importedTarget },
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
  },
);

test('it fails when the entry leaves out the file an import without an extension resolves to', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'sync/kettle/brew.ts': "import { steep } from '../steep';\n\nconsole.log(steep);\n",
    'sync/steep.ts': 'export const steep = 3;\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'brew',
        description: 'The brew script',
        files: [{ source: 'sync/kettle/brew.ts', target: 'scripts/kettle/brew.ts' }],
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
      "check-sync-manifest: entry 'brew' delivers sync/kettle/brew.ts to scripts/kettle/brew.ts, which imports ../steep, but the entry does not deliver sync/steep.ts to scripts/steep.ts\n",
  });
});

test.each([['alias.ts'], ['steep.backup']])(
  'it names the file that answers an import, not the symlink %p to the same file',
  async (decoy) => {
    const ctx = await setupTest();

    await writeTreeFiles(ctx.directory, {
      'sync/kettle/brew.ts': "import { steep } from './steep';\n\nconsole.log(steep);\n",
      'sync/kettle/steep.ts': 'export const steep = 3;\n',
      'sync/manifest.json': JSON.stringify([
        {
          name: 'brew',
          description: 'The brew script',
          files: [
            { source: 'sync/kettle/brew.ts', target: 'scripts/brew.ts' },
            { source: `sync/kettle/${decoy}`, target: `scripts/${decoy}` },
          ],
        },
      ]),
    });

    await symlink('steep.ts', join(ctx.directory, 'sync/kettle', decoy));

    const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

    expect({
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }).toStrictEqual({
      exitCode: 1,
      stdout: '',
      stderr:
        "check-sync-manifest: entry 'brew' delivers sync/kettle/brew.ts to scripts/brew.ts, which imports ./steep, but the entry does not deliver sync/kettle/steep.ts to scripts/steep.ts\n",
    });
  },
);

test.each([
  ['./steep', 'steep.ts', 'sync/kettle/steep.ts'],
  ['./alias', 'alias.ts', 'sync/kettle/alias.ts'],
  ['./alias.ts', 'alias.ts', 'sync/kettle/alias.ts'],
  ['./alias.ts', 'alias.ts', 'packages/tea/steep.ts'],
])(
  'it passes the import %p of the symlink %p when the entry names it as %p',
  async (specifier, link, deliveredSource) => {
    const ctx = await setupTest();

    await writeTreeFiles(ctx.directory, {
      'sync/kettle/brew.ts': `import { steep } from '${specifier}';\n\nconsole.log(steep);\n`,
      'packages/tea/steep.ts': 'export const steep = 3;\n',
      'sync/manifest.json': JSON.stringify([
        {
          name: 'brew',
          description: 'The brew script',
          files: [
            { source: 'sync/kettle/brew.ts', target: 'scripts/brew.ts' },
            { source: deliveredSource, target: `scripts/${link}` },
          ],
        },
      ]),
    });

    await symlink('../../packages/tea/steep.ts', join(ctx.directory, 'sync/kettle', link));

    const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

    expect({
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }).toStrictEqual({ exitCode: 0, stdout: '', stderr: '' });
  },
);

test.each([
  [
    'sync/steep.ts',
    'scripts/steep.ts',
    1,
    "check-sync-manifest: entry 'brew' delivers sync/kettle/brew.ts to scripts/kettle/brew.ts, which imports ../steep, but the entry does not deliver sync/steep.tsx to scripts/steep.tsx\n",
  ],
  ['sync/steep.tsx', 'scripts/steep.tsx', 0, ''],
])(
  'it follows the file Bun loads when two files answer an import without an extension, with %p delivered',
  async (delivered, deliveredTarget, exitCode, stderr) => {
    const ctx = await setupTest();

    await writeTreeFiles(ctx.directory, {
      'sync/kettle/brew.ts': "import { steep } from '../steep';\n\nconsole.log(steep);\n",
      'sync/steep.ts': 'export const steep = 3;\n',
      'sync/steep.tsx': 'export const steep = 4;\n',
      'sync/manifest.json': JSON.stringify([
        {
          name: 'brew',
          description: 'The brew script',
          files: [
            { source: 'sync/kettle/brew.ts', target: 'scripts/kettle/brew.ts' },
            { source: delivered, target: deliveredTarget },
          ],
        },
      ]),
    });

    const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

    expect({
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }).toStrictEqual({ exitCode, stdout: '', stderr });
  },
);

test('it reports each import of a file when one import runs through another file', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'sync/kettle/brew.ts': [
      "import { pour } from './helper.ts/missing';",
      "import { steep } from './steep.ts';",
      '',
      'console.log(pour, steep);',
      '',
    ].join('\n'),
    'sync/kettle/helper.ts': 'export const helper = 1;\n',
    'sync/kettle/steep.ts': 'export const steep = 3;\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'brew',
        description: 'The brew script',
        files: [{ source: 'sync/kettle/brew.ts', target: 'scripts/brew.ts' }],
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
    stderr: [
      "check-sync-manifest: entry 'brew' delivers sync/kettle/brew.ts to scripts/brew.ts, which imports ./helper.ts/missing, but the entry does not deliver sync/kettle/helper.ts/missing to scripts/helper.ts/missing",
      "check-sync-manifest: entry 'brew' delivers sync/kettle/brew.ts to scripts/brew.ts, which imports ./steep.ts, but the entry does not deliver sync/kettle/steep.ts to scripts/steep.ts",
      '',
    ].join('\n'),
  });
});

test('it fails when a code source does not parse', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'sync/brew.ts': 'const = ;\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'brew',
        description: 'The brew script',
        files: [{ source: 'sync/brew.ts', target: 'scripts/brew.ts' }],
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
      "collect-package-imports: sync/brew.ts does not parse\ncheck-sync-manifest: entry 'brew' delivers sync/brew.ts, whose imports cannot be read\n",
  });
});

test('it fails when another entry lists the package a code source imports', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'sync/brew.ts': "import { pourTea } from '@acme/teapot';\n",
    'sync/manifest.json': JSON.stringify([
      {
        name: 'brew',
        description: 'The brew script',
        files: [{ source: 'sync/brew.ts', target: 'scripts/brew.ts' }],
      },
      {
        name: 'teapot',
        description: 'The teapot config',
        packages: ['@acme/teapot'],
        files: [],
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
      "check-sync-manifest: entry 'brew' delivers sync/brew.ts, which imports @acme/teapot, a package its packages field does not list\n",
  });
});

test('it fails when the packages field is not a list of strings', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'sync/manifest.json': JSON.stringify([
      {
        name: 'brew',
        description: 'The brew script',
        packages: '@acme/teapot',
        files: [],
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
      "check-sync-manifest: entry 'brew' has a packages field that is not a list of strings\n",
  });
});

test("it fails when this repo's own skill-gate rules lack a gate of the shared rules", async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'sync/rules.json': JSON.stringify({
      ignore: ['vendor/'],
      gates: [
        { match: 'recipes/**', skills: ['baking'] },
        { match: 'menus/**', skills: ['plating'] },
      ],
    }),
    '.claude/skill-gate.json': JSON.stringify({
      ignore: ['vendor/'],
      gates: [
        { match: 'recipes/**', skills: ['baking'] },
        { match: '**/*.ts', skills: ['code-style'] },
      ],
    }),
    'sync/manifest.json': JSON.stringify([
      {
        name: 'kitchen-rules',
        description: 'The kitchen gate rules',
        files: [{ source: 'sync/rules.json', target: '.claude/skill-gate.json' }],
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
      'check-sync-manifest: entry \'kitchen-rules\' delivers sync/rules.json, but this repo\'s .claude/skill-gate.json lacks its gate {"match":"menus/**","skills":["plating"]}\n',
  });
});

test("it fails when this repo's own skill-gate rules lack an ignore entry of the shared rules", async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'sync/rules.json': JSON.stringify({
      ignore: ['vendor/'],
      gates: [{ match: 'recipes/**', skills: ['baking'] }],
    }),
    '.claude/skill-gate.json': JSON.stringify({
      ignore: [],
      gates: [{ match: 'recipes/**', skills: ['baking'] }],
    }),
    'sync/manifest.json': JSON.stringify([
      {
        name: 'kitchen-rules',
        description: 'The kitchen gate rules',
        files: [{ source: 'sync/rules.json', target: '.claude/skill-gate.json' }],
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
      "check-sync-manifest: entry 'kitchen-rules' delivers sync/rules.json, but this repo's .claude/skill-gate.json lacks its ignore entry \"vendor/\"\n",
  });
});

test("it passes when this repo's own skill-gate rules hold every shared ignore entry and gate, with gates of its own", async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'sync/rules.json': JSON.stringify({
      ignore: ['vendor/'],
      gates: [{ match: 'recipes/**', skills: ['baking'] }],
    }),
    '.claude/skill-gate.json': JSON.stringify({
      ignore: ['vendor/'],
      gates: [
        { match: 'recipes/**', skills: ['baking'] },
        { match: '**/*.ts', skills: ['code-style'] },
      ],
    }),
    'sync/manifest.json': JSON.stringify([
      {
        name: 'kitchen-rules',
        description: 'The kitchen gate rules',
        files: [{ source: 'sync/rules.json', target: '.claude/skill-gate.json' }],
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
