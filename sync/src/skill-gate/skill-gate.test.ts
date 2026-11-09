import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCopyPlan } from '../../../scripts/src/repo-sync/build-copy-plan.ts';
import { parseSyncEntries } from '../../../scripts/src/repo-sync/parse-sync-entries.ts';
import { pickSyncEntries } from '../../../scripts/src/repo-sync/pick-sync-entries.ts';
import { selectSyncFiles } from '../../../scripts/src/repo-sync/select-sync-files.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'skill-gate-rules-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const project = join(directory, 'project');
  const transcriptPath = join(directory, 'transcript.jsonl');
  const rulesPath = join(import.meta.dir, 'skill-gate.json');
  const manifestPath = join(import.meta.dir, '../../manifest.json');

  const indexPath = fileURLToPath(
    new URL('../../../packages/agent-hooks/src/index.ts', import.meta.url),
  );

  const runEdit = (relativePath: string) =>
    spawnSync(
      'bun',
      [
        '--eval',
        `const { runAgentHook } = await import(${JSON.stringify(indexPath)}); await runAgentHook({ harness: 'claude-code' });`,
      ],
      {
        encoding: 'utf8',
        env: { PATH: process.env['PATH'], CLAUDE_PROJECT_DIR: project },
        input: JSON.stringify({
          hook_event_name: 'PreToolUse',
          tool_name: 'Edit',
          cwd: project,
          transcript_path: transcriptPath,
          tool_input: { file_path: join(project, relativePath) },
        }),
      },
    );

  // The copies that repo-sync plans for a repo whose stub has empty skip and include inputs.
  const planSyncCopies = async (repo: string) => {
    const manifestJSON: unknown = await Bun.file(manifestPath).json();

    const manifest = parseSyncEntries(manifestJSON);
    const picked = pickSyncEntries({ manifest: manifest ?? [], skip: '', include: '' });
    const entries = picked.kind === 'picked' ? picked.entries : [];

    return buildCopyPlan({
      rows: entries.flatMap((entry) => selectSyncFiles(entry.files, repo)),
      existingWorkflows: new Map(),
      marker: '',
    }).copies.map((copy) => ({ source: copy.source, target: copy.target }));
  };

  return { project, transcriptPath, rulesPath, runEdit, planSyncCopies };
}

test.each([
  '.claude/skills/release-notes/SKILL.md',
  '.agents/skills/release-notes/SKILL.md',
  'sync/skills/release-notes/SKILL.md',
  'skills/release-notes/SKILL.md',
  '.claude/skills/release-notes/references/tone.md',
  'skills/release-notes/references/examples/short.md',
  '.worktrees/feature-branch/sync/skills/release-notes/SKILL.md',
])(
  'it refuses an edit of %s until the session loads all three skills, and names them',
  async (relativePath) => {
    const ctx = await setupTest();

    await Bun.write(join(ctx.project, '.claude/skill-gate.json'), Bun.file(ctx.rulesPath));

    await Bun.write(
      join(ctx.project, '.claude/skills/skill-writing/SKILL.md'),
      '# Skill writing\n',
    );

    await Bun.write(join(ctx.project, '.claude/skills/docs-writing/SKILL.md'), '# Docs writing\n');
    await Bun.write(join(ctx.project, '.claude/skills/deslop/SKILL.md'), '# Deslop\n');
    await Bun.write(ctx.transcriptPath, '');

    const result = ctx.runEdit(relativePath);

    expect(result.status).toBe(2);

    expect(result.stderr).toBe(
      `Load the \`skill-writing\`, \`docs-writing\` and \`deslop\` skills with the Skill tool before editing ${join(ctx.project, relativePath)}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.\n`,
    );
  },
);

test('it refuses a skill edit after the session loads skill-writing and docs-writing, and names deslop', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.project, '.claude/skill-gate.json'), Bun.file(ctx.rulesPath));
  await Bun.write(join(ctx.project, '.claude/skills/skill-writing/SKILL.md'), '# Skill writing\n');
  await Bun.write(join(ctx.project, '.claude/skills/docs-writing/SKILL.md'), '# Docs writing\n');
  await Bun.write(join(ctx.project, '.claude/skills/deslop/SKILL.md'), '# Deslop\n');

  await Bun.write(
    ctx.transcriptPath,
    [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"skill-writing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: skill-writing"}]}}',
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_2","name":"Skill","input":{"skill":"docs-writing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_2","content":"Launching skill: docs-writing"}]}}',
    ].join('\n'),
  );

  const result = ctx.runEdit('.claude/skills/release-notes/SKILL.md');

  expect(result.status).toBe(2);

  expect(result.stderr).toBe(
    `Load the \`deslop\` skill with the Skill tool before editing ${join(ctx.project, '.claude/skills/release-notes/SKILL.md')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.\n`,
  );
});

test('it allows a skill edit once the session loads all three skills', async () => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.project, '.claude/skill-gate.json'), Bun.file(ctx.rulesPath));
  await Bun.write(join(ctx.project, '.claude/skills/skill-writing/SKILL.md'), '# Skill writing\n');
  await Bun.write(join(ctx.project, '.claude/skills/docs-writing/SKILL.md'), '# Docs writing\n');
  await Bun.write(join(ctx.project, '.claude/skills/deslop/SKILL.md'), '# Deslop\n');

  await Bun.write(
    ctx.transcriptPath,
    [
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Skill","input":{"skill":"skill-writing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"Launching skill: skill-writing"}]}}',
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_2","name":"Skill","input":{"skill":"docs-writing"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_2","content":"Launching skill: docs-writing"}]}}',
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_3","name":"Skill","input":{"skill":"deslop"}}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_3","content":"Launching skill: deslop"}]}}',
    ].join('\n'),
  );

  const result = ctx.runEdit('.claude/skills/release-notes/references/tone.md');

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test.each([
  'docs/guides/release-notes.md',
  '.claude/skills/release-notes/scripts/check.sh',
  'node_modules/some-package/skills/release-notes/SKILL.md',
])('it allows an edit of %s with no skill loaded', async (relativePath) => {
  const ctx = await setupTest();

  await Bun.write(join(ctx.project, '.claude/skill-gate.json'), Bun.file(ctx.rulesPath));
  await Bun.write(join(ctx.project, '.claude/skills/skill-writing/SKILL.md'), '# Skill writing\n');
  await Bun.write(join(ctx.project, '.claude/skills/docs-writing/SKILL.md'), '# Docs writing\n');
  await Bun.write(join(ctx.project, '.claude/skills/deslop/SKILL.md'), '# Deslop\n');
  await Bun.write(ctx.transcriptPath, '');

  const result = ctx.runEdit(relativePath);

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});

test.each([
  'zgeoff/atc',
  'zgeoff/auto-mode',
  'zgeoff/boxxy',
  'zgeoff/cloud',
  'zgeoff/hq',
  'zgeoff/impz',
  'zgeoff/nixie',
  'zgeoff/noslop',
  'zgeoff/osrs',
  'zgeoff/pepys',
  'zgeoff/vers',
  'zgeoff/wringer',
])('it leaves the own .claude/skill-gate.json of %s out of the sync', async (repo) => {
  const ctx = await setupTest();
  const copies = await ctx.planSyncCopies(repo);

  expect(copies.map((copy) => copy.target)).not.toContain('.claude/skill-gate.json');
});

test.each(['zgeoff/llm', 'zgeoff/dotfiles', 'zgeoff/nixie-definitions'])(
  'it syncs the shared .claude/skill-gate.json into %s, which keeps no rules of its own',
  async (repo) => {
    const ctx = await setupTest();
    const copies = await ctx.planSyncCopies(repo);

    expect(copies).toContainEqual({
      source: '.repo-sync/sync/src/skill-gate/skill-gate.json',
      target: '.claude/skill-gate.json',
    });
  },
);

test.each([
  'skills/deslop/SKILL.md',
  'skills/cold-read/SKILL.md',
  'skills/cold-read/references/cold-reader.md',
])(
  'it syncs %s from the pinned skills source into a repo with an empty include list',
  async (path) => {
    const ctx = await setupTest();
    const copies = await ctx.planSyncCopies('zgeoff/llm');

    expect(copies).toContainEqual({
      source: `.repo-sync-skills/${path}`,
      target: `.claude/${path}`,
    });
  },
);
