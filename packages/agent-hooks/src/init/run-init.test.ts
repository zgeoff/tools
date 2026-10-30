import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  await runInit({ projectDir: ctx.project, fileSystem: bunFileSystem });

  const firstClaude = await readFile(join(ctx.project, '.claude/settings.json'), 'utf8');
  const firstCodex = await readFile(join(ctx.project, '.codex/hooks.json'), 'utf8');

  await runInit({ projectDir: ctx.project, fileSystem: bunFileSystem });

  const secondClaude = await readFile(join(ctx.project, '.claude/settings.json'), 'utf8');
  const secondCodex = await readFile(join(ctx.project, '.codex/hooks.json'), 'utf8');

  expect(secondClaude).toBe(firstClaude);
  expect(secondCodex).toBe(firstCodex);
});

test('it refuses a broken rules file and writes nothing', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.project, '.claude/skill-gate.json'), '{"gates": {}}');

  const result = await runInit({ projectDir: ctx.project, fileSystem: bunFileSystem });

  expect(result).toStrictEqual({
    ok: false,
    error: '.claude/skill-gate.json `gates` must be an array',
  });

  const claudeExists = await Bun.file(join(ctx.project, '.claude/settings.json')).exists();

  expect(claudeExists).toBeFalse();
});

test('it refuses a settings file that is not JSON and leaves both files alone', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.project, '.codex'));
  await writeFile(join(ctx.project, '.codex/hooks.json'), '{ "hooks": ');

  const result = await runInit({ projectDir: ctx.project, fileSystem: bunFileSystem });

  expect(result).toStrictEqual({
    ok: false,
    error: expect.toStartWith('.codex/hooks.json is not valid JSON: '),
  });

  const claudeExists = await Bun.file(join(ctx.project, '.claude/settings.json')).exists();
  const codexText = await readFile(join(ctx.project, '.codex/hooks.json'), 'utf8');

  expect(claudeExists).toBeFalse();
  expect(codexText).toBe('{ "hooks": ');
});

test('it reports the settings file it could not write and stops before the next one', async () => {
  const writeText = mock((filePath: string) =>
    Promise.reject(new Error(`EACCES: permission denied, open '${filePath}'`)),
  );

  const result = await runInit({
    projectDir: '/work/ledger',
    fileSystem: { readText: () => Promise.resolve(null), writeText },
  });

  expect(result).toStrictEqual({
    ok: false,
    error:
      ".claude/settings.json could not be written: EACCES: permission denied, open '/work/ledger/.claude/settings.json'",
  });

  expect(writeText).toHaveBeenCalledTimes(1);
});
