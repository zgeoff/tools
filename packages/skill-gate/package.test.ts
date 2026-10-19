import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import invariant from 'tiny-invariant';

const TSC_PATH = join(import.meta.dir, '../../node_modules/.bin/tsc');

// The package packed and installed from its tarball into a fresh project, with the entry point a
// repo carries at .claude/hooks/skill-gate/skill-gate.ts. Every build and pack writes under the
// test's own folder, never the shared dist, so overlapping runs cannot race.
async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'skill-gate-package-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  // The real HOME keeps bun install on the shared cache.
  const env = { PATH: process.env['PATH'], HOME: process.env['HOME'] };
  const unpacked = join(dir, 'unpacked');
  const packed = join(dir, 'packed');
  const project = join(dir, 'project');
  const stdPacked = join(dir, 'std-packed');

  await Promise.all([
    mkdir(unpacked),
    mkdir(packed),
    mkdir(stdPacked),
    mkdir(join(project, '.claude/hooks/skill-gate'), { recursive: true }),
  ]);

  // The source pack runs no build; it gives the published manifest, with workspace versions
  // resolved. The declarations then build into the unpacked copy, as the publish's prepare does.
  await $`bun pm pack --ignore-scripts --destination ${dir}`
    .cwd(import.meta.dir)
    .env(env)
    .quiet();

  const entries = await readdir(dir);

  const manifest = entries.find((name) => name.endsWith('.tgz'));

  invariant(manifest !== undefined, 'bun pm pack wrote no tarball');

  await $`tar -xzf ${join(dir, manifest)} -C ${unpacked}`.env(env).quiet();

  await rm(join(unpacked, 'package/dist'), { recursive: true, force: true });

  await $`bun run build:outdir ${join(unpacked, 'package/dist')}`
    .cwd(import.meta.dir)
    .env(env)
    .quiet();

  await $`bun pm pack --ignore-scripts --destination ${packed}`
    .cwd(join(unpacked, 'package'))
    .env(env)
    .quiet();

  const [tarball, ...extra] = await readdir(packed);

  invariant(tarball !== undefined && extra.length === 0, 'bun pm pack must write one tarball');

  // A release PR bumps std before npm has the new version, so std installs from its own tarball.
  // The shipped declarations never import std, so its source pack needs no build.
  await $`bun pm pack --ignore-scripts --destination ${stdPacked}`
    .cwd(join(import.meta.dir, '../std'))
    .env(env)
    .quiet();

  const [stdTarball, ...stdExtra] = await readdir(stdPacked);

  invariant(
    stdTarball !== undefined && stdExtra.length === 0,
    'bun pm pack must write one tarball',
  );

  await writeFile(
    join(project, 'package.json'),
    JSON.stringify({
      name: 'project',
      private: true,
      devDependencies: { '@zgeoff/skill-gate': `file:${join(packed, tarball)}` },
      overrides: { '@zgeoff/std': `file:${join(stdPacked, stdTarball)}` },
    }),
  );

  await writeFile(
    join(project, '.claude/hooks/skill-gate/skill-gate.ts'),
    "import { runSkillGate } from '@zgeoff/skill-gate';\n\nawait runSkillGate();\n",
  );

  await $`bun install`.cwd(project).env(env).quiet();

  return { project, env, hookPath: join(project, '.claude/hooks/skill-gate/skill-gate.ts') };
}

test('it denies a gated edit through the entry point when the session has not loaded the skill', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.project, '.claude/skills/docs-writing'), { recursive: true });
  await writeFile(join(ctx.project, '.claude/skills/docs-writing/SKILL.md'), '# Docs writing\n');

  await writeFile(
    join(ctx.project, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.md', skills: ['docs-writing'] }] }),
  );

  await writeFile(join(ctx.project, 'transcript.jsonl'), '');

  const payload = JSON.stringify({
    cwd: ctx.project,
    transcript_path: join(ctx.project, 'transcript.jsonl'),
    tool_input: { file_path: join(ctx.project, 'guide.md') },
  });

  const result = await $`bun ${ctx.hookPath} < ${new Response(payload)}`
    .cwd(ctx.project)
    .env({ ...ctx.env, CLAUDE_PROJECT_DIR: ctx.project })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);

  expect(result.json()).toStrictEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Load the \`docs-writing\` skill with the Skill tool before editing ${join(ctx.project, 'guide.md')}, then retry the edit. Change a gated path only with Edit, Write or MultiEdit, never through Bash. .claude/skill-gate.json lists the skills each path needs.`,
    },
  });
});

test('it allows an ungated edit through the entry point with no output', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.project, '.claude/skills/docs-writing'), { recursive: true });
  await writeFile(join(ctx.project, '.claude/skills/docs-writing/SKILL.md'), '# Docs writing\n');

  await writeFile(
    join(ctx.project, '.claude/skill-gate.json'),
    JSON.stringify({ gates: [{ match: '**/*.md', skills: ['docs-writing'] }] }),
  );

  await writeFile(join(ctx.project, 'transcript.jsonl'), '');

  const payload = JSON.stringify({
    cwd: ctx.project,
    transcript_path: join(ctx.project, 'transcript.jsonl'),
    tool_input: { file_path: join(ctx.project, 'src/main.ts') },
  });

  const result = await $`bun ${ctx.hookPath} < ${new Response(payload)}`
    .cwd(ctx.project)
    .env({ ...ctx.env, CLAUDE_PROJECT_DIR: ctx.project })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('');
});

test('it types runSkillGate from the shipped declarations for a TypeScript consumer', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.project, 'consumer.ts'),
    [
      "import { runSkillGate } from '@zgeoff/skill-gate';",
      '',
      'type IsEqual<A, B> =',
      '  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;',
      '',
      'export const isRunSkillGateTyped: IsEqual<typeof runSkillGate, () => Promise<never>> = true;',
      '',
    ].join('\n'),
  );

  await writeFile(
    join(ctx.project, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: 'preserve',
        moduleResolution: 'bundler',
        types: [],
      },
      files: ['consumer.ts'],
    }),
  );

  const result = await $`${TSC_PATH} -p ${ctx.project} --listFilesOnly`
    .cwd(ctx.project)
    .env(ctx.env)
    .nothrow()
    .quiet();

  const listed = result.stdout.toString();

  expect(result.exitCode).toBe(0);
  expect(listed).toContain('node_modules/@zgeoff/skill-gate/dist/index.d.ts');
  expect(listed).not.toContain('node_modules/@zgeoff/skill-gate/src/');

  const checked = await $`${TSC_PATH} -p ${ctx.project}`
    .cwd(ctx.project)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(checked.stdout.toString()).toBe('');
  expect(checked.exitCode).toBe(0);
});
