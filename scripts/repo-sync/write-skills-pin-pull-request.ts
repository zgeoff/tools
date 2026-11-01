import { join } from 'node:path';
import { isRecord } from '../../packages/std/src/is-record.ts';
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

// Holds the next pin commit until the pin branch moves to it.
const stagingBranch = 'skills-pin-next';

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

  if (openNumber !== '' && proposed === null) {
    options.writeOutput(
      `::error::the open pin pull request #${openNumber} holds no full commit ID in ${skillsPinPath}\n`,
    );

    return 1;
  }

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

  const head = await writePinBranch(options);
  const number = await writePinPullRequest(options, pinned, openNumber);

  // Auto-merge binds to the commit this run wrote, so a later push to the branch never merges
  // unchecked.
  const merge = await runGH(options, [
    'pr',
    'merge',
    number,
    '--repo',
    options.repo,
    '--auto',
    '--squash',
    '--match-head-commit',
    head,
  ]);

  if (merge.exitCode !== 0) {
    options.writeOutput(
      '::warning::GitHub refused auto-merge; allow auto-merge in the repo settings, or merge the pull request by hand.\n',
    );
  }

  return 0;
}

// Returns the number of the open pin pull request from this repo's own branch, or empty for none.
// gh matches --head by branch name alone, so a fork's pull request from a branch of the same name
// is listed too, and the step must never turn auto-merge on for it.
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
    'number,isCrossRepository',
  ]);

  const pullsValue: unknown = JSON.parse(listed.stdout);
  const pulls: unknown[] = Array.isArray(pullsValue) ? pullsValue : [];
  const own = pulls.find((pull) => isRecord(pull) && pull['isCrossRepository'] === false);

  return isRecord(own) && typeof own['number'] === 'number' ? String(own['number']) : '';
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

// The pin on the branch of the open pin pull request; null when the branch holds no full commit
// ID. The run stops on a failed read or a null, as a run that skipped the check could replace a
// newer pin.
async function readProposedPin(
  options: Readonly<WriteSkillsPinPullRequestOptions>,
): Promise<string | null> {
  const shown = await runCheckedGH(options, [
    'api',
    `repos/${options.repo}/contents/${skillsPinPath}?ref=${pinBranch}`,
    '-H',
    'Accept: application/vnd.github.raw',
  ]);

  const proposedValue: unknown = JSON.parse(shown.stdout);

  return parseSkillsPin(proposedValue);
}

// Returns empty when GitHub does not hold one of the commits.
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

  if (compared.exitCode === 0) {
    return compared.stdout.trim();
  }

  // A 404 is an answer, as GitHub gives it for a commit it does not hold. Any other failure stops
  // the run, as a run that read it as a refusal could drop a pin move.
  if (compared.stderr.includes('(HTTP 404)')) {
    return '';
  }

  throw new Error(`gh api compare ${base}...${head} failed: ${compared.stderr.trim()}`);
}

function runGH(
  options: Readonly<WriteSkillsPinPullRequestOptions>,
  args: readonly string[],
): Promise<CommandResult> {
  return options.runCommand(['gh', ...args], { cwd: options.cwd, env: options.env });
}

// Returns the commit it wrote, which the contents API writes as the App on a staging branch, so
// GitHub signs it. The pin branch moves to it in one step, as a pin branch reset to main would leave
// the open pull request with no commits, and GitHub closes such a pull request.
async function writePinBranch(
  options: Readonly<WriteSkillsPinPullRequestOptions>,
): Promise<string> {
  // The branch starts from the checkout the pin was read from, not from main as it is now. A pin
  // that merged since then changes the same line, so the pull request conflicts and never merges an
  // older pin over it.
  const checkedOut = await runCheckedCommand(options.runCommand, ['git', 'rev-parse', 'HEAD'], {
    cwd: options.cwd,
    env: options.env,
  });

  await writeBranchRef(options, stagingBranch, checkedOut.stdout.trim());

  const file = await runCheckedGH(options, [
    'api',
    `repos/${options.repo}/contents/${skillsPinPath}?ref=${stagingBranch}`,
    '--jq',
    '.sha',
  ]);

  const text = `${JSON.stringify({ commit: options.commit }, null, 2)}\n`;

  const written = await runCheckedGH(options, [
    'api',
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
    `branch=${stagingBranch}`,
    '--jq',
    '.commit.sha',
  ]);

  const head = written.stdout.trim();

  await writeBranchRef(options, pinBranch, head);

  await runCheckedGH(options, [
    'api',
    '--silent',
    '-X',
    'DELETE',
    `repos/${options.repo}/git/refs/heads/${stagingBranch}`,
  ]);

  return head;
}

// Points the branch at the commit, and creates the branch when it does not exist.
async function writeBranchRef(
  options: Readonly<WriteSkillsPinPullRequestOptions>,
  branch: string,
  commit: string,
): Promise<void> {
  const current = await runGH(options, ['api', `repos/${options.repo}/git/ref/heads/${branch}`]);

  await (current.exitCode === 0
    ? runCheckedGH(options, [
        'api',
        '--silent',
        '-X',
        'PATCH',
        `repos/${options.repo}/git/refs/heads/${branch}`,
        '-f',
        `sha=${commit}`,
        '-F',
        'force=true',
      ])
    : runCheckedGH(options, [
        'api',
        '--silent',
        `repos/${options.repo}/git/refs`,
        '-f',
        `ref=refs/heads/${branch}`,
        '-f',
        `sha=${commit}`,
      ]));
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
