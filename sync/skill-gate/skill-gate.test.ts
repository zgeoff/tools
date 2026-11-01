import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'skill-gate-rules-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const project = join(directory, 'project');
  const transcriptPath = join(directory, 'transcript.jsonl');

  const indexPath = fileURLToPath(
    new URL('../../packages/agent-hooks/src/index.ts', import.meta.url),
  );

  await mkdir(join(project, '.claude'), { recursive: true });

  await copyFile(
    join(import.meta.dir, 'skill-gate.json'),
    join(project, '.claude/skill-gate.json'),
  );

  await Promise.all(
    ['skill-writing', 'docs-writing', 'deslop'].map(async (skill) => {
      await mkdir(join(project, '.claude/skills', skill), { recursive: true });
      await writeFile(join(project, '.claude/skills', skill, 'SKILL.md'), `# ${skill}\n`);
    }),
  );

  const writeLoadedSkills = (skills: readonly string[]) =>
    writeFile(
      transcriptPath,
      skills
        .flatMap((skill, index) => [
          JSON.stringify({
            type: 'assistant',
            message: {
              content: [
                { type: 'tool_use', id: `toolu_${index}`, name: 'Skill', input: { skill } },
              ],
            },
          }),
          JSON.stringify({
            type: 'user',
            message: {
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: `toolu_${index}`,
                  content: `Launching skill: ${skill}`,
                },
              ],
            },
          }),
        ])
        .join('\n'),
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

  return { project, writeLoadedSkills, runEdit };
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

    await ctx.writeLoadedSkills([]);

    const result = ctx.runEdit(relativePath);

    expect(result.status).toBe(2);

    expect(result.stderr).toBe(
      `Load the \`skill-writing\`, \`docs-writing\` and \`deslop\` skills with the Skill tool before editing ${join(ctx.project, relativePath)}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.\n`,
    );
  },
);

test('it refuses a skill edit after the session loads skill-writing and docs-writing, and names deslop', async () => {
  const ctx = await setupTest();

  await ctx.writeLoadedSkills(['skill-writing', 'docs-writing']);

  const result = ctx.runEdit('.claude/skills/release-notes/SKILL.md');

  expect(result.status).toBe(2);

  expect(result.stderr).toBe(
    `Load the \`deslop\` skill with the Skill tool before editing ${join(ctx.project, '.claude/skills/release-notes/SKILL.md')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.\n`,
  );
});

test('it allows a skill edit once the session loads all three skills', async () => {
  const ctx = await setupTest();

  await ctx.writeLoadedSkills(['skill-writing', 'docs-writing', 'deslop']);

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

  await ctx.writeLoadedSkills([]);

  const result = ctx.runEdit(relativePath);

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
});
