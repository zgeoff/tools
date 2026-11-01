import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { FileSystem } from '../ci/file-system.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { CommandResult, RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { parseSkillsPin } from '../repo-sync/parse-skills-pin.ts';
import { skillsPinPath } from '../repo-sync/skills-pin-path.ts';
import { flockLockFile } from './flock-lock-file.ts';
import { pinnedSkillsFolder } from './pinned-skills-folder.ts';
import { withInstallLock } from './with-install-lock.ts';

export interface WritePinnedSkillsOptions {
  // The root of a tools checkout.
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  // The URL that, with a commit appended, serves the gzipped tarball of zgeoff/skills at it.
  readonly archiveBaseURL: string;

  // The skills this repo takes, each linked into .claude/skills/.
  readonly skills: readonly string[];

  readonly fileSystem: Pick<
    FileSystem,
    'createDirectory' | 'probePath' | 'readDirectory' | 'readText' | 'removePath'
  >;

  // Moves a path to another in one step, replacing a file or link there, and fails when a folder
  // that holds files is there.
  readonly renamePath: (from: string, to: string) => Promise<void>;

  // Names this run's own scratch paths.
  readonly runID: string;

  // Runs the work while this run holds the lock on the path, so installs that share a checkout run
  // one at a time.
  readonly withLock: <T>(lockPath: string, work: () => Promise<T>) => Promise<T>;

  readonly runCommand: RunCommand;
  readonly writeOutput: (text: string) => void;
}

// Unpacks zgeoff/skills at the pinned commit once, links each skill this repo takes to its folder
// in that tree, as repo-sync gives another repo its copy, and drops the trees of other commits.
export function writePinnedSkills(options: Readonly<WritePinnedSkillsOptions>): Promise<number> {
  const lockPath = join(options.cwd, `${pinnedSkillsFolder}.lock`);

  return options.withLock(lockPath, () => writeLockedSkills(options));
}

// The pin is read under the lock, so a run that waited installs the pin as it is now.
async function writeLockedSkills(options: Readonly<WritePinnedSkillsOptions>): Promise<number> {
  const pinText = await options.fileSystem.readText(join(options.cwd, skillsPinPath));

  const pinValue: unknown = JSON.parse(pinText);
  const commit = parseSkillsPin(pinValue);

  if (commit === null) {
    options.writeOutput(`skills: ${skillsPinPath} holds no full commit ID of zgeoff/skills\n`);

    return 1;
  }

  const folder = join(options.cwd, pinnedSkillsFolder);

  const hasTree = await options.fileSystem.probePath(join(folder, commit));

  if (!hasTree) {
    await writeSkillsTree(options, folder, commit);
  }

  // Each other path is the tree of an older pin or the scratch of a stopped run.
  const trees = await options.fileSystem.readDirectory(folder);

  for (const stale of trees.filter((name) => name !== commit)) {
    await options.fileSystem.removePath(join(folder, stale));
  }

  await options.fileSystem.createDirectory(join(options.cwd, '.claude', 'skills'));

  for (const skill of options.skills) {
    const linked = await writeSkillLink(options, commit, skill);

    if (!linked) {
      return 1;
    }
  }

  options.writeOutput(
    `skills: linked ${options.skills.join(', ')} from zgeoff/skills at ${commit}\n`,
  );

  return 0;
}

// The tree unpacks beside its final path and moves there whole, so a stopped run leaves no tree
// that a later run would take for complete.
async function writeSkillsTree(
  options: Readonly<WritePinnedSkillsOptions>,
  folder: string,
  commit: string,
): Promise<void> {
  const partial = join(folder, `${commit}.${options.runID}.partial`);
  const archive = join(folder, `${commit}.${options.runID}.tar.gz`);

  await options.fileSystem.removePath(partial);
  await options.fileSystem.createDirectory(partial);

  const url = `${options.archiveBaseURL}${commit}`;

  await runChecked(options, ['curl', '-fsSL', '--retry', '3', '-o', archive, url]);
  await runChecked(options, ['tar', '-xzf', archive, '--strip-components=1', '-C', partial]);

  await options.fileSystem.removePath(archive);
  await options.renamePath(partial, join(folder, commit));
}

function runChecked(
  options: Readonly<WritePinnedSkillsOptions>,
  argv: readonly string[],
): Promise<CommandResult> {
  return runCheckedCommand(options.runCommand, argv, { cwd: options.cwd, env: options.env });
}

// Returns false, with the reason in the output, when the skill cannot be linked.
async function writeSkillLink(
  options: Readonly<WritePinnedSkillsOptions>,
  commit: string,
  skill: string,
): Promise<boolean> {
  const source = join(options.cwd, pinnedSkillsFolder, commit, 'skills', skill, 'SKILL.md');

  const hasSkill = await options.fileSystem.probePath(source);

  if (!hasSkill) {
    options.writeOutput(`skills: zgeoff/skills at ${commit} holds no ${skill} skill\n`);

    return false;
  }

  const link = join('.claude', 'skills', skill);

  const exists = await options.fileSystem.probePath(join(options.cwd, link));

  const isLink = exists
    ? await options.runCommand(['test', '-L', link], { cwd: options.cwd, env: options.env })
    : null;

  if (isLink !== null && isLink.exitCode !== 0) {
    options.writeOutput(
      `skills: ${link} is a folder of its own, so the skill is not linked; move it, then run bun run skills:install\n`,
    );

    return false;
  }

  // The link is made aside and renamed over the old one, so a stopped run never leaves the path
  // half replaced.
  const staged = join('.claude', 'skills', `.${skill}.${options.runID}`);

  await runChecked(options, [
    'ln',
    '-sfn',
    join('..', '..', pinnedSkillsFolder, commit, 'skills', skill),
    staged,
  ]);

  await options.renamePath(join(options.cwd, staged), join(options.cwd, link));

  return true;
}

if (import.meta.main) {
  process.exitCode = await writePinnedSkills({
    cwd: process.cwd(),
    env: process.env,
    archiveBaseURL: 'https://codeload.github.com/zgeoff/skills/tar.gz/',
    skills: ['code-style', 'docs-writing'],
    fileSystem: nodeFileSystem,
    renamePath: rename,
    runID: String(process.pid),
    withLock: (lockPath, work) =>
      withInstallLock(
        { lockPath, lockFile: flockLockFile, wait: () => Bun.sleep(250), attempts: 480 },
        work,
      ),
    runCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
