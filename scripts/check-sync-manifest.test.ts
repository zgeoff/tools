import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'check-sync-manifest-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const scriptPath = fileURLToPath(new URL('check-sync-manifest.sh', import.meta.url));

  return { directory, scriptPath };
}

test('it fails when a skill folder holds a file its entry omits', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'sync/skills/demo/references'), { recursive: true });
  await writeFile(join(ctx.directory, 'sync/skills/demo/SKILL.md'), '# Demo\n');
  await writeFile(join(ctx.directory, 'sync/skills/demo/references/go.md'), '# Go\n');

  await writeFile(
    join(ctx.directory, 'sync/manifest.json'),
    JSON.stringify([
      {
        name: 'skill-demo',
        description: 'The demo skill',
        files: [{ source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' }],
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
      "check-sync-manifest: entry 'skill-demo' ships sync/skills/demo/, but omits sync/skills/demo/references/go.md\n",
  });
});

test('it fails when two entries split one skill folder between them', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'sync/skills/demo/references'), { recursive: true });
  await writeFile(join(ctx.directory, 'sync/skills/demo/SKILL.md'), '# Demo\n');
  await writeFile(join(ctx.directory, 'sync/skills/demo/references/go.md'), '# Go\n');

  await writeFile(
    join(ctx.directory, 'sync/manifest.json'),
    JSON.stringify([
      {
        name: 'skill-demo',
        description: 'The demo skill',
        files: [{ source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' }],
      },
      {
        name: 'skill-demo-go',
        description: 'The demo skill Go reference',
        files: [
          {
            source: 'sync/skills/demo/references/go.md',
            target: '.claude/skills/demo/references/go.md',
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
      "check-sync-manifest: entry 'skill-demo-go' ships sync/skills/demo/, but omits sync/skills/demo/SKILL.md\ncheck-sync-manifest: entry 'skill-demo' ships sync/skills/demo/, but omits sync/skills/demo/references/go.md\n",
  });
});

test('it fails when no entry lists a file from a skill folder', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'sync/skills/demo'), { recursive: true });
  await writeFile(join(ctx.directory, 'sync/skills/demo/SKILL.md'), '# Demo\n');
  await writeFile(join(ctx.directory, 'sync/manifest.json'), JSON.stringify([]));

  const result = await $`bash ${ctx.scriptPath}`.cwd(ctx.directory).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr:
      'check-sync-manifest: skill folder sync/skills/demo/ holds sync/skills/demo/SKILL.md, but no entry lists a file from that folder\n',
  });
});

test('it passes when the entry lists every file in its skill folder', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'sync/skills/demo/references'), { recursive: true });
  await writeFile(join(ctx.directory, 'sync/skills/demo/SKILL.md'), '# Demo\n');
  await writeFile(join(ctx.directory, 'sync/skills/demo/references/go.md'), '# Go\n');

  await writeFile(
    join(ctx.directory, 'sync/manifest.json'),
    JSON.stringify([
      {
        name: 'skill-demo',
        description: 'The demo skill',
        files: [
          { source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' },
          {
            source: 'sync/skills/demo/references/go.md',
            target: '.claude/skills/demo/references/go.md',
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

test('it passes when the entry omits only a test beside a skill script', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'sync/skills/demo/scripts'), { recursive: true });
  await writeFile(join(ctx.directory, 'sync/skills/demo/SKILL.md'), '# Demo\n');
  await writeFile(join(ctx.directory, 'sync/skills/demo/scripts/check.sh'), 'exit 0\n');
  await writeFile(join(ctx.directory, 'sync/skills/demo/scripts/check.test.ts'), '');

  await writeFile(
    join(ctx.directory, 'sync/manifest.json'),
    JSON.stringify([
      {
        name: 'skill-demo',
        description: 'The demo skill',
        files: [
          { source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' },
          {
            source: 'sync/skills/demo/scripts/check.sh',
            target: '.claude/skills/demo/scripts/check.sh',
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
