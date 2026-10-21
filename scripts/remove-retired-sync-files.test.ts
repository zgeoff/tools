import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGitCommit } from '../test-utils/create-git-commit.ts';
import { readGitEnv } from '../test-utils/read-git-env.ts';
import { runGit } from '../test-utils/run-git.ts';
import { writeTreeFiles } from '../test-utils/write-tree-files.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'remove-retired-sync-files-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);
  const tools = join(directory, 'tools');
  const caller = join(directory, 'caller');

  await mkdir(tools);
  await mkdir(caller);
  await runGit(tools, env, ['init', '-q']);
  await runGit(caller, env, ['init', '-q']);

  const scriptPath = fileURLToPath(new URL('remove-retired-sync-files.sh', import.meta.url));

  return { directory, env, tools, caller, scriptPath };
}

test('it deletes a file an earlier manifest delivered and the current manifest drops', async () => {
  const ctx = await setupTest();

  await createGitCommit(ctx.tools, ctx.env, {
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

  await createGitCommit(ctx.tools, ctx.env, {
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-demo',
        files: [{ source: 'sync/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' }],
      },
    ]),
  });

  await writeTreeFiles(ctx.caller, {
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

  await createGitCommit(ctx.tools, ctx.env, {
    'sync/demo/check.sh': 'echo first\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-demo',
        files: [{ source: 'sync/demo/check.sh', target: '.claude/skills/demo/scripts/check.sh' }],
      },
    ]),
  });

  await createGitCommit(ctx.tools, ctx.env, { 'sync/demo/check.sh': 'echo second\n' });
  await createGitCommit(ctx.tools, ctx.env, { 'sync/manifest.json': '[]' });
  await writeTreeFiles(ctx.caller, { '.claude/skills/demo/scripts/check.sh': 'echo first\n' });

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

  await createGitCommit(ctx.tools, ctx.env, {
    'sync/demo/check.sh': 'echo check\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-demo',
        files: [{ source: 'sync/demo/check.sh', target: '.claude/skills/demo/scripts/check.sh' }],
      },
    ]),
  });

  await createGitCommit(ctx.tools, ctx.env, { 'sync/manifest.json': '[]' });

  await writeTreeFiles(ctx.caller, {
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

  await createGitCommit(ctx.tools, ctx.env, {
    'sync/build.sh': 'echo shared\n',
    'sync/manifest.json': JSON.stringify([
      { name: 'build', files: [{ source: 'sync/build.sh', target: 'scripts/build.sh' }] },
    ]),
  });

  await createGitCommit(ctx.tools, ctx.env, { 'sync/manifest.json': '[]' });
  await writeTreeFiles(ctx.caller, { 'scripts/build.sh': 'echo own\n' });

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

  await createGitCommit(ctx.tools, ctx.env, {
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

  await createGitCommit(ctx.tools, ctx.env, {
    'sync/manifest.json': JSON.stringify([
      {
        name: 'hook-demo',
        files: [{ source: 'sync/demo/run.ts', target: '.claude/hooks/demo/run.ts' }],
      },
    ]),
  });

  await writeTreeFiles(ctx.caller, {
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

  await createGitCommit(ctx.tools, ctx.env, {
    'sync/build.sh': 'echo shared\n',
    'sync/manifest.json': JSON.stringify([
      { name: 'build', files: [{ source: 'sync/build.sh', target: 'scripts/build.sh' }] },
    ]),
  });

  await createGitCommit(ctx.tools, ctx.env, { 'sync/manifest.json': '[]' });
  await writeTreeFiles(ctx.caller, { 'scripts/build.sh': 'echo shared\n' });

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

  await createGitCommit(ctx.tools, ctx.env, { 'sync/manifest.json': '[]' });
  await createGitCommit(ctx.tools, ctx.env, { 'sync/README.md': '# Sync\n' });

  const shallow = join(ctx.directory, 'shallow');

  await runGit(ctx.directory, ctx.env, [
    'clone',
    '-q',
    '--depth',
    '1',
    `file://${ctx.tools}`,
    shallow,
  ]);

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

  await createGitCommit(ctx.tools, ctx.env, {
    'sync/workflow-callers/lint.yml':
      'jobs:\n  lint:\n    uses: zgeoff/tools/.github/workflows/lint.yml@main\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'workflow-lint',
        files: [{ source: 'sync/workflow-callers/lint.yml', target: '.github/workflows/lint.yml' }],
      },
    ]),
  });

  await createGitCommit(ctx.tools, ctx.env, { 'sync/manifest.json': '[]' });

  await writeTreeFiles(ctx.caller, {
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

  await createGitCommit(ctx.tools, ctx.env, {
    'sync/skills/demo/SKILL.md':
      '# Demo\n\n<!-- repo-sync needs ./go.md -->\n\nRead [Go](./go.md).\n\n<!-- repo-sync end -->\n\nThe end.\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-demo',
        files: [{ source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' }],
      },
    ]),
  });

  await createGitCommit(ctx.tools, ctx.env, { 'sync/manifest.json': '[]' });
  await writeTreeFiles(ctx.caller, { '.claude/skills/demo/SKILL.md': '# Demo\n\nThe end.\n' });

  const result = spawnSync('bash', [ctx.scriptPath, ctx.tools, ''], {
    cwd: ctx.caller,
    encoding: 'utf8',
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('.claude/skills/demo/SKILL.md\n');
  expect(existsSync(join(ctx.caller, '.claude/skills/demo/SKILL.md'))).toBeFalse();
});

test('it keeps a retired Markdown copy whose edit sits inside a kept block', async () => {
  const ctx = await setupTest();

  await createGitCommit(ctx.tools, ctx.env, {
    'sync/skills/demo/SKILL.md':
      '# Demo\n\n<!-- repo-sync needs ./go.md -->\n\nRead [Go](./go.md).\n\n<!-- repo-sync end -->\n\nThe end.\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'skill-demo',
        files: [{ source: 'sync/skills/demo/SKILL.md', target: '.claude/skills/demo/SKILL.md' }],
      },
    ]),
  });

  await createGitCommit(ctx.tools, ctx.env, { 'sync/manifest.json': '[]' });

  await writeTreeFiles(ctx.caller, {
    '.claude/skills/demo/SKILL.md':
      '# Demo\n\n<!-- repo-sync needs ./go.md -->\n\nRead [Go](./go.md) before the repo notes.\n\n<!-- repo-sync end -->\n\nThe end.\n',
  });

  const result = spawnSync('bash', [ctx.scriptPath, ctx.tools, ''], {
    cwd: ctx.caller,
    encoding: 'utf8',
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
  expect(existsSync(join(ctx.caller, '.claude/skills/demo/SKILL.md'))).toBeTrue();
});

test('it deletes the edited old copy of a renamed file across the skipped tags', async () => {
  const ctx = await setupTest();

  await createGitCommit(ctx.tools, ctx.env, {
    'sync/demo/list-files.ts':
      'const first = 1;\nconst second = 2;\nconst third = 3;\nconst fourth = 4;\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'pre-push-demo',
        files: [{ source: 'sync/demo/list-files.ts', target: 'scripts/list-files.ts' }],
      },
    ]),
  });

  await createGitCommit(ctx.tools, ctx.env, {
    'sync/demo/list-files.ts':
      'const first = 1;\nconst second = 2;\nconst third = 3;\nconst fourth = 4;\nconst fifth = 5;\n',
  });

  await rm(join(ctx.tools, 'sync/demo/list-files.ts'));

  await createGitCommit(ctx.tools, ctx.env, {
    'sync/demo/read-files.ts':
      'const first = 1;\nconst second = 2;\nconst third = 3;\nconst fourth = 4;\nconst fifth = 5;\nconst sixth = 6;\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'pre-push-demo',
        files: [{ source: 'sync/demo/read-files.ts', target: 'scripts/read-files.ts' }],
      },
    ]),
  });

  await createGitCommit(ctx.tools, ctx.env, { 'sync/README.md': '# Sync\n' });

  await writeTreeFiles(ctx.caller, {
    'scripts/list-files.ts':
      'const first = 1;\nconst second = 2;\nconst own = 3;\nconst fourth = 4;\n',
    'scripts/read-files.ts':
      'const first = 1;\nconst second = 2;\nconst third = 3;\nconst fourth = 4;\nconst fifth = 5;\nconst sixth = 6;\n',
  });

  const result = spawnSync(
    'bash',
    [ctx.scriptPath, ctx.tools, 'pre-push-demo', '', 'scripts/read-files.ts'],
    { cwd: ctx.caller, encoding: 'utf8' },
  );

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('scripts/list-files.ts\n');
  expect(existsSync(join(ctx.caller, 'scripts/list-files.ts'))).toBeFalse();
  expect(existsSync(join(ctx.caller, 'scripts/read-files.ts'))).toBeTrue();
});

test('it keeps the edited old copy of a renamed file when the run did not copy the new one', async () => {
  const ctx = await setupTest();

  await createGitCommit(ctx.tools, ctx.env, {
    'sync/demo/list-files.ts':
      'const first = 1;\nconst second = 2;\nconst third = 3;\nconst fourth = 4;\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'pre-push-demo',
        files: [{ source: 'sync/demo/list-files.ts', target: 'scripts/list-files.ts' }],
      },
    ]),
  });

  await createGitCommit(ctx.tools, ctx.env, {
    'sync/demo/list-files.ts':
      'const first = 1;\nconst second = 2;\nconst third = 3;\nconst fourth = 4;\nconst fifth = 5;\n',
  });

  await rm(join(ctx.tools, 'sync/demo/list-files.ts'));

  await createGitCommit(ctx.tools, ctx.env, {
    'sync/demo/read-files.ts':
      'const first = 1;\nconst second = 2;\nconst third = 3;\nconst fourth = 4;\nconst fifth = 5;\nconst sixth = 6;\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'pre-push-demo',
        files: [{ source: 'sync/demo/read-files.ts', target: 'scripts/read-files.ts' }],
      },
    ]),
  });

  await createGitCommit(ctx.tools, ctx.env, { 'sync/README.md': '# Sync\n' });

  await writeTreeFiles(ctx.caller, {
    'scripts/list-files.ts':
      'const first = 1;\nconst second = 2;\nconst own = 3;\nconst fourth = 4;\n',
    'scripts/read-files.ts': 'const own = 1;\n',
  });

  const result = spawnSync('bash', [ctx.scriptPath, ctx.tools, 'pre-push-demo', '', ''], {
    cwd: ctx.caller,
    encoding: 'utf8',
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
  expect(existsSync(join(ctx.caller, 'scripts/list-files.ts'))).toBeTrue();
});

test('it keeps the edited old copy of a renamed file when the run did not sync its entry', async () => {
  const ctx = await setupTest();

  await createGitCommit(ctx.tools, ctx.env, {
    'sync/demo/list-files.ts':
      'const first = 1;\nconst second = 2;\nconst third = 3;\nconst fourth = 4;\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'pre-push-demo',
        files: [{ source: 'sync/demo/list-files.ts', target: 'scripts/list-files.ts' }],
      },
    ]),
  });

  await createGitCommit(ctx.tools, ctx.env, {
    'sync/demo/list-files.ts':
      'const first = 1;\nconst second = 2;\nconst third = 3;\nconst fourth = 4;\nconst fifth = 5;\n',
  });

  await rm(join(ctx.tools, 'sync/demo/list-files.ts'));

  await createGitCommit(ctx.tools, ctx.env, {
    'sync/demo/read-files.ts':
      'const first = 1;\nconst second = 2;\nconst third = 3;\nconst fourth = 4;\nconst fifth = 5;\nconst sixth = 6;\n',
    'sync/manifest.json': JSON.stringify([
      {
        name: 'pre-push-demo',
        files: [{ source: 'sync/demo/read-files.ts', target: 'scripts/read-files.ts' }],
      },
    ]),
  });

  await createGitCommit(ctx.tools, ctx.env, { 'sync/README.md': '# Sync\n' });

  await writeTreeFiles(ctx.caller, {
    'scripts/list-files.ts':
      'const first = 1;\nconst second = 2;\nconst own = 3;\nconst fourth = 4;\n',
    'scripts/read-files.ts':
      'const first = 1;\nconst second = 2;\nconst third = 3;\nconst fourth = 4;\nconst fifth = 5;\nconst sixth = 6;\n',
  });

  const result = spawnSync(
    'bash',
    [ctx.scriptPath, ctx.tools, 'socket', '', 'scripts/read-files.ts'],
    { cwd: ctx.caller, encoding: 'utf8' },
  );

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
  expect(existsSync(join(ctx.caller, 'scripts/list-files.ts'))).toBeTrue();
});
