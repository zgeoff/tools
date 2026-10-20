import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function runGit(directory: string, args: string[]) {
  const result = spawnSync(
    'git',
    ['-c', 'user.name=Sync Test', '-c', 'user.email=sync-test@example.com', ...args],
    { cwd: directory, encoding: 'utf8' },
  );

  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
}

async function writeFiles(directory: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), content);
  }
}

async function writeToolsCommit(directory: string, files: Record<string, string>) {
  await writeFiles(directory, files);

  runGit(directory, ['add', '-A']);
  runGit(directory, ['commit', '-q', '-m', 'chore: change the synced files']);
}

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'remove-retired-sync-files-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const tools = join(directory, 'tools');
  const caller = join(directory, 'caller');

  await mkdir(tools);
  await mkdir(caller);

  runGit(tools, ['init', '-q']);
  runGit(caller, ['init', '-q']);

  const scriptPath = fileURLToPath(new URL('remove-retired-sync-files.sh', import.meta.url));

  return { directory, tools, caller, scriptPath };
}

test('it deletes a file an earlier manifest delivered and the current manifest drops', async () => {
  const ctx = await setupTest();

  await writeToolsCommit(ctx.tools, {
    'sync/demo/check.sh': 'echo check\n',
    'sync/demo/SKILL.md': '# Demo\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-demo',
        files: [
          { source: 'sync/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' },
          { source: 'sync/demo/check.sh', target: '.claude/skills/demo/scripts/check.sh' },
        ],
      },
    ]),
  });

  await writeToolsCommit(ctx.tools, {
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-demo',
        files: [{ source: 'sync/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' }],
      },
    ]),
  });

  await writeFiles(ctx.caller, {
    '.claude/skills/demo/SKILL.md': '# Demo\n',
    '.claude/skills/demo/scripts/check.sh': 'echo check\n',
  });

  const result = spawnSync('bash', [ctx.scriptPath, ctx.tools, 'skill-demo'], {
    cwd: ctx.caller,
    encoding: 'utf8',
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('.claude/skills/demo/scripts/check.sh\n');
  expect(existsSync(join(ctx.caller, '.claude/skills/demo/scripts/check.sh'))).toBeFalse();
  expect(existsSync(join(ctx.caller, '.claude/skills/demo/SKILL.md'))).toBeTrue();
});

test('it deletes a retired file that matches an older version of its source', async () => {
  const ctx = await setupTest();

  await writeToolsCommit(ctx.tools, {
    'sync/demo/check.sh': 'echo first\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-demo',
        files: [{ source: 'sync/demo/check.sh', target: '.claude/skills/demo/scripts/check.sh' }],
      },
    ]),
  });

  await writeToolsCommit(ctx.tools, { 'sync/demo/check.sh': 'echo second\n' });
  await writeToolsCommit(ctx.tools, { 'sync/manifest.json': '[]' });
  await writeFiles(ctx.caller, { '.claude/skills/demo/scripts/check.sh': 'echo first\n' });

  const result = spawnSync('bash', [ctx.scriptPath, ctx.tools, ''], {
    cwd: ctx.caller,
    encoding: 'utf8',
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('.claude/skills/demo/scripts/check.sh\n');
  expect(existsSync(join(ctx.caller, '.claude/skills/demo/scripts/check.sh'))).toBeFalse();
});

test('it keeps a file the repo owns outside the synced paths', async () => {
  const ctx = await setupTest();

  await writeToolsCommit(ctx.tools, {
    'sync/demo/check.sh': 'echo check\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-demo',
        files: [{ source: 'sync/demo/check.sh', target: '.claude/skills/demo/scripts/check.sh' }],
      },
    ]),
  });

  await writeToolsCommit(ctx.tools, { 'sync/manifest.json': '[]' });

  await writeFiles(ctx.caller, {
    '.claude/skills/demo/scripts/check.sh': 'echo check\n',
    'scripts/check.sh': 'echo check\n',
  });

  const result = spawnSync('bash', [ctx.scriptPath, ctx.tools, ''], {
    cwd: ctx.caller,
    encoding: 'utf8',
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('.claude/skills/demo/scripts/check.sh\n');
  expect(existsSync(join(ctx.caller, 'scripts/check.sh'))).toBeTrue();
});

test('it keeps a file at a retired path whose content no source version matches', async () => {
  const ctx = await setupTest();

  await writeToolsCommit(ctx.tools, {
    'sync/build.sh': 'echo shared\n',
    'sync/manifest.json': JSON.stringify([
      { name: 'build', files: [{ source: 'sync/build.sh', target: 'scripts/build.sh' }] },
    ]),
  });

  await writeToolsCommit(ctx.tools, { 'sync/manifest.json': '[]' });
  await writeFiles(ctx.caller, { 'scripts/build.sh': 'echo own\n' });

  const result = spawnSync('bash', [ctx.scriptPath, ctx.tools, ''], {
    cwd: ctx.caller,
    encoding: 'utf8',
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
  expect(existsSync(join(ctx.caller, 'scripts/build.sh'))).toBeTrue();
});

test('it keeps a retired file whose entry is still in the manifest and did not sync', async () => {
  const ctx = await setupTest();

  await writeToolsCommit(ctx.tools, {
    'sync/demo/run.ts': 'export {};\n',
    'sync/demo/helper.ts': 'export {};\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'hook-demo',
        files: [
          { source: 'sync/demo/run.ts', target: '.claude/hooks/demo/run.ts' },
          { source: 'sync/demo/helper.ts', target: '.claude/hooks/demo/helper.ts' },
        ],
      },
    ]),
  });

  await writeToolsCommit(ctx.tools, {
    'sync/manifest.json': JSON.stringify([
      {
        name: 'hook-demo',
        files: [{ source: 'sync/demo/run.ts', target: '.claude/hooks/demo/run.ts' }],
      },
    ]),
  });

  await writeFiles(ctx.caller, {
    '.claude/hooks/demo/run.ts': 'export {};\n',
    '.claude/hooks/demo/helper.ts': 'export {};\n',
  });

  const result = spawnSync('bash', [ctx.scriptPath, ctx.tools, 'socket'], {
    cwd: ctx.caller,
    encoding: 'utf8',
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
  expect(existsSync(join(ctx.caller, '.claude/hooks/demo/helper.ts'))).toBeTrue();
});

test('it keeps a retired file whose entry the skip list names', async () => {
  const ctx = await setupTest();

  await writeToolsCommit(ctx.tools, {
    'sync/build.sh': 'echo shared\n',
    'sync/manifest.json': JSON.stringify([
      { name: 'build', files: [{ source: 'sync/build.sh', target: 'scripts/build.sh' }] },
    ]),
  });

  await writeToolsCommit(ctx.tools, { 'sync/manifest.json': '[]' });
  await writeFiles(ctx.caller, { 'scripts/build.sh': 'echo shared\n' });

  const result = spawnSync('bash', [ctx.scriptPath, ctx.tools, '', 'socket, build'], {
    cwd: ctx.caller,
    encoding: 'utf8',
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
  expect(existsSync(join(ctx.caller, 'scripts/build.sh'))).toBeTrue();
});

test('it fails on a shallow checkout of tools', async () => {
  const ctx = await setupTest();

  await writeToolsCommit(ctx.tools, { 'sync/manifest.json': '[]' });
  await writeToolsCommit(ctx.tools, { 'sync/README.md': '# Sync\n' });

  const shallow = join(ctx.directory, 'shallow');

  runGit(ctx.directory, ['clone', '-q', '--depth', '1', `file://${ctx.tools}`, shallow]);

  const result = spawnSync('bash', [ctx.scriptPath, shallow, ''], {
    cwd: ctx.caller,
    encoding: 'utf8',
  });

  expect(result.status).toBe(1);

  expect(result.stderr).toBe(
    `remove-retired-sync-files: ${shallow} is a shallow clone, so it lacks the earlier manifests\n`,
  );
});

test('it deletes a retired workflow whose calls the sync pinned to a tag', async () => {
  const ctx = await setupTest();

  await writeToolsCommit(ctx.tools, {
    'sync/workflow-callers/lint.yml':
      'jobs:\n  lint:\n    uses: zgeoff/tools/.github/workflows/lint.yml@main\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'workflow-lint',
        files: [{ source: 'sync/workflow-callers/lint.yml', target: '.github/workflows/lint.yml' }],
      },
    ]),
  });

  await writeToolsCommit(ctx.tools, { 'sync/manifest.json': '[]' });

  await writeFiles(ctx.caller, {
    '.github/workflows/lint.yml':
      'jobs:\n  lint:\n    uses: zgeoff/tools/.github/workflows/lint.yml@sync-v7\n',
  });

  const result = spawnSync('bash', [ctx.scriptPath, ctx.tools, ''], {
    cwd: ctx.caller,
    encoding: 'utf8',
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('.github/workflows/lint.yml\n');
  expect(existsSync(join(ctx.caller, '.github/workflows/lint.yml'))).toBeFalse();
});

test('it deletes a retired Markdown copy that lost a block the repo was excepted from', async () => {
  const ctx = await setupTest();

  await writeToolsCommit(ctx.tools, {
    'sync/skills/demo/SKILL.md':
      '# Demo\n\n<!-- repo-sync needs ./go.md -->\n\nRead [Go](./go.md).\n\n<!-- repo-sync end -->\n\nThe end.\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-demo',
        files: [{ source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' }],
      },
    ]),
  });

  await writeToolsCommit(ctx.tools, { 'sync/manifest.json': '[]' });
  await writeFiles(ctx.caller, { '.claude/skills/demo/SKILL.md': '# Demo\n\nThe end.\n' });

  const result = spawnSync('bash', [ctx.scriptPath, ctx.tools, ''], {
    cwd: ctx.caller,
    encoding: 'utf8',
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('.claude/skills/demo/SKILL.md\n');
  expect(existsSync(join(ctx.caller, '.claude/skills/demo/SKILL.md'))).toBeFalse();
});
