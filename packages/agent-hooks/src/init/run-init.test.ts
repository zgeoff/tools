import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeRejectingStub } from '../../../../test-utils/make-rejecting-stub.ts';
import { makeResolvingStub } from '../../../../test-utils/make-resolving-stub.ts';
import { writeTreeFiles } from '../../../../test-utils/write-tree-files.ts';
import { bunFileSystem } from './bun-file-system.ts';
import { runInit } from './run-init.ts';

async function setupTest() {
  const project = await mkdtemp(join(tmpdir(), 'agent-hooks-init-'));

  onTestFinished(() => rm(project, { recursive: true, force: true }));

  await mkdir(join(project, '.claude'));

  return { project };
}

test('it writes both settings files with a matcher for each gated tool', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.project, {
    '.claude/hooks/start.ts': 'await import("@zgeoff/agent-hooks");\n',
  });

  await writeFile(
    join(ctx.project, '.claude/skill-gate.json'),
    JSON.stringify({
      gates: [],
      tools: [
        { tool: 'mcp__tracker__update_ticket', skills: ['ticket-review'] },
        { tool: 'mcp__tracker__update_ticket', skills: ['ticket-style'] },
      ],
    }),
  );

  const result = await runInit({ projectDir: ctx.project, fileSystem: bunFileSystem });

  expect(result).toStrictEqual({
    ok: true,
    written: ['.claude/settings.json', '.codex/hooks.json'],
  });

  const claudeSettings: unknown = await Bun.file(join(ctx.project, '.claude/settings.json')).json();
  const codexHooks: unknown = await Bun.file(join(ctx.project, '.codex/hooks.json')).json();

  expect(claudeSettings).toMatchObject({
    hooks: { PreToolUse: [{ matcher: 'Edit|Write|MultiEdit|Bash|mcp__tracker__update_ticket' }] },
  });

  expect(codexHooks).toMatchObject({
    hooks: { PreToolUse: [{ matcher: 'Bash|apply_patch|mcp__tracker__update_ticket' }] },
  });
});

test('it leaves both files byte for byte the same on a second run', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.project, {
    '.claude/hooks/start.ts': 'await import("@zgeoff/agent-hooks");\n',
  });

  await runInit({ projectDir: ctx.project, fileSystem: bunFileSystem });

  const firstClaude = await readFile(join(ctx.project, '.claude/settings.json'), 'utf8');
  const firstCodex = await readFile(join(ctx.project, '.codex/hooks.json'), 'utf8');

  await runInit({ projectDir: ctx.project, fileSystem: bunFileSystem });

  const secondClaude = await readFile(join(ctx.project, '.claude/settings.json'), 'utf8');
  const secondCodex = await readFile(join(ctx.project, '.codex/hooks.json'), 'utf8');

  expect(secondClaude).toBe(firstClaude);
  expect(secondCodex).toBe(firstCodex);
});

test('it reports the settings file it could not write and stops before the next one', async () => {
  const writeText = makeRejectingStub(
    new Error("EACCES: permission denied, open '/work/ledger/.claude/settings.json'"),
  );

  const result = await runInit({
    projectDir: '/work/ledger',
    fileSystem: {
      readText: (filePath) =>
        Promise.resolve(
          new Map([['/work/ledger/.claude/hooks/start.ts', '']]).get(filePath) ?? null,
        ),
      writeText,
    },
  });

  expect(result).toStrictEqual({
    ok: false,
    error:
      ".claude/settings.json could not be written: EACCES: permission denied, open '/work/ledger/.claude/settings.json'",
  });

  expect(writeText).toHaveBeenCalledTimes(1);
});

test('it refuses to write the hook entries until the start-up stub exists', async () => {
  const writeText = makeResolvingStub(undefined);

  const result = await runInit({
    projectDir: '/work/ledger',
    fileSystem: { readText: () => Promise.resolve(null), writeText },
  });

  expect(result).toStrictEqual({
    ok: false,
    error:
      '.claude/hooks/start.ts is missing. Take the hook-start entry of repo-sync and merge its pull request, then run agent-hooks init again.',
  });

  expect(writeText).not.toHaveBeenCalled();
});
