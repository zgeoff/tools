import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import invariant from 'tiny-invariant';
import { fileLocks } from '../../test-utils/file-locks.ts';
import { probeProcess } from '../../test-utils/probe-process.ts';
import { systemClock } from '../../test-utils/system-clock.ts';
import { templateFiles } from '../../test-utils/template-files.ts';
import { withPerRunTemplate } from '../../test-utils/with-per-run-template.ts';

async function setupTest() {
  // The real HOME keeps bun install on the shared cache.
  const env = { PATH: process.env['PATH'], HOME: process.env['HOME'] };
  const repoRoot = join(import.meta.dir, '../..');

  // The bundle takes in @zgeoff/std, the declaration build extends the base tsconfig, and this
  // file holds the recipe that writes the template.
  const sourcePaths = await Array.fromAsync(
    new Bun.Glob('packages/{skill-gate,std}/src/**').scan({ cwd: repoRoot, absolute: true }),
  );

  const directory = await mkdtemp(join(tmpdir(), 'skill-gate-package-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const project = join(directory, 'project');
  const packageManifestPath = join(directory, 'package.json');

  const readTemplate = async (templateDirectory: string) => {
    await cp(join(templateDirectory, 'project'), project, {
      recursive: true,
      verbatimSymlinks: true,
    });

    await cp(join(templateDirectory, 'unpacked/package/package.json'), packageManifestPath);
  };

  // Packing, building and installing the package costs more than a test, so each run builds it
  // once and each test copies the installed project.
  await withPerRunTemplate(
    {
      cacheDirectory: join(repoRoot, 'node_modules/.cache/test-templates'),
      name: 'skill-gate-package',
      inputPaths: [
        ...sourcePaths,
        import.meta.path,
        join(import.meta.dir, 'package.json'),
        join(import.meta.dir, 'tsconfig.json'),
        join(import.meta.dir, 'tsconfig.build.json'),
        join(repoRoot, 'bun.lock'),
        join(repoRoot, 'tsconfig.base.json'),
      ],
      files: templateFiles,
      locks: fileLocks,
      clock: systemClock,
      probeProcess,
      processID: process.pid,
      writeTemplate: async (buildDirectory) => {
        const unpacked = join(buildDirectory, 'unpacked');
        const packed = join(buildDirectory, 'packed');
        const templateProject = join(buildDirectory, 'project');

        await Promise.all([
          mkdir(unpacked),
          mkdir(packed),
          mkdir(join(templateProject, '.claude/hooks/skill-gate'), { recursive: true }),
        ]);

        // prepare's build writes the shared dist, which an overlapping run would race, so the pack
        // skips it and the bundle builds into the unpacked copy instead.
        await $`bun pm pack --ignore-scripts --destination ${buildDirectory}`
          .cwd(import.meta.dir)
          .env(env)
          .quiet();

        const entries = await readdir(buildDirectory);

        const manifest = entries.find((name) => name.endsWith('.tgz'));

        invariant(manifest !== undefined, 'bun pm pack wrote no tarball');

        await $`tar -xzf ${join(buildDirectory, manifest)} -C ${unpacked}`.env(env).quiet();

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

        invariant(
          tarball !== undefined && extra.length === 0,
          'bun pm pack must write one tarball',
        );

        await writeFile(
          join(templateProject, 'package.json'),
          JSON.stringify({
            name: 'project',
            private: true,
            devDependencies: { '@zgeoff/skill-gate': `file:${join(packed, tarball)}` },
          }),
        );

        await writeFile(
          join(templateProject, '.claude/hooks/skill-gate/skill-gate.ts'),
          "import { runSkillGate } from '@zgeoff/skill-gate';\n\nawait runSkillGate();\n",
        );

        await $`bun install`.cwd(templateProject).env(env).quiet();
      },
    },
    readTemplate,
  );

  return {
    project,
    env,
    tscPath: join(repoRoot, 'node_modules/.bin/tsc'),
    hookPath: join(project, '.claude/hooks/skill-gate/skill-gate.ts'),
    packageManifestPath,
  };
}

// Bun's auto-install, which loads the package when a repo has no node_modules, resolves a
// dependency against a cached registry manifest that it never refreshes.
test('it ships with no runtime dependencies, so an install fetches the package alone', async () => {
  const ctx = await setupTest();
  const packageManifest: unknown = await Bun.file(ctx.packageManifestPath).json();

  expect(packageManifest).not.toContainKey('dependencies');

  const installed = await readdir(join(ctx.project, 'node_modules/@zgeoff'));

  expect(installed).toStrictEqual(['skill-gate']);
});

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
      "import type { Harness } from '@zgeoff/skill-gate';",
      '',
      'type IsEqual<A, B> =',
      '  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;',
      '',
      'export const isRunSkillGateTyped: IsEqual<typeof runSkillGate, (harness?: Harness) => Promise<never>> = true;',
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

  const result = await $`${ctx.tscPath} -p ${ctx.project} --listFilesOnly`
    .cwd(ctx.project)
    .env(ctx.env)
    .nothrow()
    .quiet();

  const listed = result.stdout.toString();

  expect(result.exitCode).toBe(0);
  expect(listed).toContain('node_modules/@zgeoff/skill-gate/dist/index.d.ts');
  expect(listed).not.toContain('node_modules/@zgeoff/skill-gate/src/');

  const checked = await $`${ctx.tscPath} -p ${ctx.project}`
    .cwd(ctx.project)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(checked.stdout.toString()).toBe('');
  expect(checked.exitCode).toBe(0);
});
