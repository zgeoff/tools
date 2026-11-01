import { join } from 'node:path';
import type { FileSystem } from '../ci/file-system.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { CommandResult, RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { parseSkillsPin } from './parse-skills-pin.ts';
import { pickSkillsPinMove } from './pick-skills-pin-move.ts';
import { skillsPinPath } from './skills-pin-path.ts';

export interface WriteSkillsPinPullRequestOptions {
  // A checkout of main of zgeoff/tools.
  readonly cwd: string;

  // The whole environment of each gh command; GH_TOKEN holds the sync App's token for this repo.
  readonly env: Readonly<Record<string, string | undefined>>;

  // The commit of zgeoff/skills that the dispatch names.
  readonly commit: string;

  // The owner and name of this repository.
  readonly repo: string;

  readonly fileSystem: Pick<FileSystem, 'readText'>;
  readonly runCommand: RunCommand;

  // Receives the step's log.
  readonly writeOutput: (text: string) => void;
}

const pinBranch = 'skills-pin';

// Opens, or moves, one pull request on the skills-pin branch that changes only the pin, with
// auto-merge on, so the pin reaches main once the checks pass and the sync dispatch sends it on.
export async function writeSkillsPinPullRequest(
  options: Readonly<WriteSkillsPinPullRequestOptions>,
): Promise<number> {
  if (!/^[0-9a-f]{40}$/u.test(options.commit)) {
    options.writeOutput(`::error::'${options.commit}' is not a full commit ID of zgeoff/skills\n`);

    return 1;
  }

  const pinText = await options.fileSystem.readText(join(options.cwd, skillsPinPath));

  const pinValue: unknown = JSON.parse(pinText);
  const pinned = parseSkillsPin(pinValue);

  if (pinned === null) {
    options.writeOutput(`::error::${skillsPinPath} holds no full commit ID of zgeoff/skills\n`);

    return 1;
  }

  const openNumber = await readOpenPinPullRequest(options);

  const proposed = openNumber === '' ? null : await readProposedPin(options);

  const sincePin = await readCompareStatus(options, pinned, options.commit);

  const sinceProposed =
    proposed === null ? null : await readCompareStatus(options, proposed, options.commit);

  const mainSinceCommit = await readCompareStatus(options, options.commit, 'main');

  const move = pickSkillsPinMove({
    commit: options.commit,
    sincePin,
    sinceProposed,
    mainSinceCommit,
  });

  if (move.kind === 'skip') {
    options.writeOutput(`Nothing to pin: ${move.reason}.\n`);

    return 0;
  }

  if (move.kind === 'refused') {
    options.writeOutput(`::error::${move.message}\n`);

    return 1;
  }

  await writePinBranch(options);

  const number = await writePinPullRequest(options, pinned, openNumber);

  const merge = await runGH(options, [
    'pr',
    'merge',
    number,
    '--repo',
    options.repo,
    '--auto',
    '--squash',
  ]);

  if (merge.exitCode !== 0) {
    options.writeOutput(
      '::warning::GitHub refused auto-merge; allow auto-merge in the repo settings, or merge the pull request by hand.\n',
    );
  }

  return 0;
}

// Returns the number of the open pin pull request, or empty for none.
async function readOpenPinPullRequest(
  options: Readonly<WriteSkillsPinPullRequestOptions>,
): Promise<string> {
  const listed = await runCheckedGH(options, [
    'pr',
    'list',
    '--repo',
    options.repo,
    '--head',
    pinBranch,
    '--state',
    'open',
    '--json',
    'number',
    '--jq',
    '.[0].number // empty',
  ]);

  return listed.stdout.trim();
}

function runCheckedGH(
  options: Readonly<WriteSkillsPinPullRequestOptions>,
  args: readonly string[],
): Promise<CommandResult> {
  return runCheckedCommand(options.runCommand, ['gh', ...args], {
    cwd: options.cwd,
    env: options.env,
  });
}

// The pin on the branch of the open pin pull request; null when the branch holds none.
async function readProposedPin(
  options: Readonly<WriteSkillsPinPullRequestOptions>,
): Promise<string | null> {
  const shown = await runGH(options, [
    'api',
    `repos/${options.repo}/contents/${skillsPinPath}?ref=${pinBranch}`,
    '-H',
    'Accept: application/vnd.github.raw',
  ]);

  if (shown.exitCode !== 0) {
    return null;
  }

  const proposedValue: unknown = JSON.parse(shown.stdout);

  return parseSkillsPin(proposedValue);
}

function runGH(
  options: Readonly<WriteSkillsPinPullRequestOptions>,
  args: readonly string[],
): Promise<CommandResult> {
  return options.runCommand(['gh', ...args], { cwd: options.cwd, env: options.env });
}

// Returns empty when the API refuses, as it does for a commit that zgeoff/skills does not hold.
async function readCompareStatus(
  options: Readonly<WriteSkillsPinPullRequestOptions>,
  base: string,
  head: string,
): Promise<string> {
  const compared = await runGH(options, [
    'api',
    `repos/zgeoff/skills/compare/${base}...${head}`,
    '--jq',
    '.status',
  ]);

  return compared.exitCode === 0 ? compared.stdout.trim() : '';
}

// The branch restarts from main on every move, so the pull request holds one commit. The contents
// API writes that commit as the App, so GitHub signs it and the ruleset attributes it.
async function writePinBranch(options: Readonly<WriteSkillsPinPullRequestOptions>): Promise<void> {
  const main = await runCheckedGH(options, [
    'api',
    `repos/${options.repo}/git/ref/heads/main`,
    '--jq',
    '.object.sha',
  ]);

  const head = main.stdout.trim();

  const branch = await runGH(options, ['api', `repos/${options.repo}/git/ref/heads/${pinBranch}`]);

  await (branch.exitCode === 0
    ? runCheckedGH(options, [
        'api',
        '--silent',
        '-X',
        'PATCH',
        `repos/${options.repo}/git/refs/heads/${pinBranch}`,
        '-f',
        `sha=${head}`,
        '-F',
        'force=true',
      ])
    : runCheckedGH(options, [
        'api',
        '--silent',
        `repos/${options.repo}/git/refs`,
        '-f',
        `ref=refs/heads/${pinBranch}`,
        '-f',
        `sha=${head}`,
      ]));

  const file = await runCheckedGH(options, [
    'api',
    `repos/${options.repo}/contents/${skillsPinPath}?ref=${pinBranch}`,
    '--jq',
    '.sha',
  ]);

  const text = `${JSON.stringify({ commit: options.commit }, null, 2)}\n`;

  await runCheckedGH(options, [
    'api',
    '--silent',
    '-X',
    'PUT',
    `repos/${options.repo}/contents/${skillsPinPath}`,
    '-f',
    `message=${renderPinTitle(options.commit)}`,
    '-f',
    `content=${Buffer.from(text).toString('base64')}`,
    '-f',
    `sha=${file.stdout.trim()}`,
    '-f',
    `branch=${pinBranch}`,
  ]);
}

function renderPinTitle(commit: string): string {
  return `chore(skills): pin zgeoff/skills at ${commit.slice(0, 12)}`;
}

async function writePinPullRequest(
  options: Readonly<WriteSkillsPinPullRequestOptions>,
  pinned: string,
  number: string,
): Promise<string> {
  const title = renderPinTitle(options.commit);
  const body = `Moves \`${skillsPinPath}\` to zgeoff/skills ${options.commit}, which zgeoff/skills sent from its green main. Once this merges and main is green, the sync dispatch sends the new skill text to every repo that takes it.\n\nChanges: https://github.com/zgeoff/skills/compare/${pinned}...${options.commit}`;

  if (number !== '') {
    await runCheckedGH(options, [
      'pr',
      'edit',
      number,
      '--repo',
      options.repo,
      '--title',
      title,
      '--body',
      body,
    ]);

    options.writeOutput(`Updated pull request #${number} for ${pinBranch}.\n`);

    return number;
  }

  const created = await runCheckedGH(options, [
    'pr',
    'create',
    '--repo',
    options.repo,
    '--base',
    'main',
    '--head',
    pinBranch,
    '--title',
    title,
    '--body',
    body,
  ]);

  options.writeOutput(created.stdout);

  // gh prints the new pull request's URL, which ends in its number.
  const url = created.stdout.trim();

  return url.slice(url.lastIndexOf('/') + 1);
}

if (import.meta.main) {
  process.exitCode = await writeSkillsPinPullRequest({
    cwd: process.cwd(),
    env: process.env,
    commit: process.env['SKILLS_COMMIT'] ?? '',
    repo: process.env['REPO'] ?? '',
    fileSystem: nodeFileSystem,
    runCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
