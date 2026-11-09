import { join } from 'node:path';
import { isRecord } from '../../../packages/std/src/is-record.ts';
import { writeStdout } from '../../../packages/std/src/write-stdout.ts';
import type { FileSystem } from '../ci/file-system.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { CommandResult, RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { isCoveredPinHead } from './is-covered-pin-head.ts';
import { parseSkillsPin } from './parse-skills-pin.ts';
import { pickSkillsPinMove } from './pick-skills-pin-move.ts';
import { readPinManifestFacts } from './read-pin-manifest-facts.ts';
import { readSkillFilesManifest } from './read-skill-files-manifest.ts';
import { skillsPinPath } from './skills-pin-path.ts';
import { syncManifestPath } from './sync-manifest-path.ts';
import { writeStagedManifest } from './write-staged-manifest.ts';

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

// Opens, or moves, one pull request on the skills-pin branch that changes the pin, and adds to the
// sync manifest each new file of a skill folder it ships, with auto-merge on, so the pin reaches
// main once the checks pass and the sync dispatch sends it on.
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

  // A run that stopped after it opened the pull request left auto-merge off, so a later run that
  // finds the branch already covers its commit turns auto-merge on for the branch as it stands.
  if (move.kind === 'covered') {
    options.writeOutput(`Nothing to pin: ${move.reason}.\n`);

    return writeCoveredAutoMerge(options, openNumber, proposed);
  }

  // The branch starts from the checkout the pin was read from, not from main as it is now. A pin
  // that merged since then changes the same line, so the pull request conflicts and never merges an
  // older pin over it.
  const checkedOut = await runCheckedCommand(options.runCommand, ['git', 'rev-parse', 'HEAD'], {
    cwd: options.cwd,
    env: options.env,
  });

  const branch = await writePinBranch(options, checkedOut.stdout.trim());

  if (branch === null) {
    return 1;
  }

  if (openNumber === '') {
    const number = await writePinPullRequest(options, { pinned, number: '', added: branch.added });

    await writePinAutoMerge(options, number, branch.head);

    return 0;
  }

  return writeReusedPinPullRequest(options, { pinned, number: openNumber, proposed, branch });
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

// The branch head is bound only after it shows the pin pull request's own change. Anything else
// waits for a person.
async function writeCoveredAutoMerge(
  options: Readonly<WriteSkillsPinPullRequestOptions>,
  number: string,
  proposed: string | null,
): Promise<number> {
  const viewed = await runCheckedGH(options, [
    'pr',
    'view',
    number,
    '--repo',
    options.repo,
    '--json',
    'headRefOid,files',
  ]);

  const view: unknown = JSON.parse(viewed.stdout);
  const head = isRecord(view) && typeof view['headRefOid'] === 'string' ? view['headRefOid'] : '';
  const files = isRecord(view) && Array.isArray(view['files']) ? view['files'] : [];
  const paths = files.map((file: unknown) => (isRecord(file) ? file['path'] : null));

  const shown = await runCheckedGH(options, [
    'api',
    `repos/${options.repo}/contents/${skillsPinPath}?ref=${head}`,
    '-H',
    'Accept: application/vnd.github.raw',
  ]);

  const headValue: unknown = JSON.parse(shown.stdout);
  const headPin = parseSkillsPin(headValue);

  const manifest =
    paths.includes(syncManifestPath) && headPin !== null
      ? await readPinManifestFacts(options, head, headPin)
      : null;

  if (!isCoveredPinHead({ paths, headPin, proposed, manifest })) {
    options.writeOutput(
      `::error::the open pin pull request #${number} changes more than ${skillsPinPath} and the skill files of ${syncManifestPath}, or moved since this run read it; check it by hand\n`,
    );

    return 1;
  }

  options.writeOutput(`Turning auto-merge on for pull request #${number} at ${head}.\n`);

  await writePinAutoMerge(options, number, head);

  return 0;
}

// Auto-merge binds to the commit given, so a later push to the branch never merges unchecked.
async function writePinAutoMerge(
  options: Readonly<WriteSkillsPinPullRequestOptions>,
  number: string,
  head: string,
): Promise<void> {
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
}

interface PinBranch {
  // The last commit the run wrote.
  readonly head: string;

  // The zgeoff/skills sources the run added to the manifest.
  readonly added: readonly string[];
}

// The contents API writes each commit as the App on a staging branch, so GitHub signs it. The pin
// branch moves to the last in one step, as a pin branch reset to main would leave the open pull
// request with no commits, and GitHub closes such a pull request.
async function writePinBranch(
  options: Readonly<WriteSkillsPinPullRequestOptions>,
  base: string,
): Promise<PinBranch | null> {
  const update = await readSkillFilesManifest(options, base, options.commit);

  if (update === null) {
    options.writeOutput(
      `::error::GitHub gave a truncated tree of zgeoff/skills ${options.commit}, or no content of ${syncManifestPath} at ${base}; the next dispatch moves the pin\n`,
    );

    return null;
  }

  await writeBranchRef(options, stagingBranch, base);

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

  const head =
    update.added.length === 0
      ? written.stdout.trim()
      : await writeStagedManifest(options, update, stagingBranch);

  await writeBranchRef(options, pinBranch, head);

  await runCheckedGH(options, [
    'api',
    '--silent',
    '-X',
    'DELETE',
    `repos/${options.repo}/git/refs/heads/${stagingBranch}`,
  ]);

  return { head, added: update.added };
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

interface PinPullRequest {
  // The pin on main that the pull request moves from.
  readonly pinned: string;

  // The pull request to edit, or empty to open one.
  readonly number: string;

  // The zgeoff/skills sources the branch adds to the manifest.
  readonly added: readonly string[];
}

async function writePinPullRequest(
  options: Readonly<WriteSkillsPinPullRequestOptions>,
  pull: Readonly<PinPullRequest>,
): Promise<string> {
  const title = renderPinTitle(options.commit);
  const body = `Moves \`${skillsPinPath}\` to zgeoff/skills ${options.commit}, which zgeoff/skills sent from its green main. Once this merges and main is green, the sync dispatch sends the new skill text to every repo that takes it.${renderAddedFiles(pull.added)}\n\nChanges: https://github.com/zgeoff/skills/compare/${pull.pinned}...${options.commit}`;

  if (pull.number !== '') {
    await runCheckedGH(options, [
      'pr',
      'edit',
      pull.number,
      '--repo',
      options.repo,
      '--title',
      title,
      '--body',
      body,
    ]);

    options.writeOutput(`Updated pull request #${pull.number} for ${pinBranch}.\n`);

    return pull.number;
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

function renderAddedFiles(added: readonly string[]): string {
  if (added.length === 0) {
    return '';
  }

  const lines = added.map((source) => `- \`${source}\``);

  return `\n\nAdds the new files of the skill folders it syncs to \`${syncManifestPath}\`:\n\n${lines.join('\n')}`;
}

interface ReusedPinPullRequest {
  // The pin on main of the checkout, and the one the open pull request held when the run read it.
  readonly pinned: string;
  readonly proposed: string | null;

  readonly number: string;

  // What the run wrote to the pin branch.
  readonly branch: Readonly<PinBranch>;
}

// The open pull request can merge, or close, at any time before this run moves its branch. A pull
// request that is no longer open takes no edit, so the run opens a new one. After a merge, main has
// moved, so the new pull request starts from main as it is now, once main shows the pin that merged.
async function writeReusedPinPullRequest(
  options: Readonly<WriteSkillsPinPullRequestOptions>,
  reused: Readonly<ReusedPinPullRequest>,
): Promise<number> {
  const viewed = await runCheckedGH(options, [
    'pr',
    'view',
    reused.number,
    '--repo',
    options.repo,
    '--json',
    'state',
    '--jq',
    '.state',
  ]);

  const state = viewed.stdout.trim();

  if (state === 'OPEN') {
    const number = await writePinPullRequest(options, {
      pinned: reused.pinned,
      number: reused.number,
      added: reused.branch.added,
    });

    await writePinAutoMerge(options, number, reused.branch.head);

    return 0;
  }

  if (state !== 'MERGED') {
    options.writeOutput(
      `Pull request #${reused.number} is ${state}, so the run opens a new one.\n`,
    );

    const number = await writePinPullRequest(options, {
      pinned: reused.pinned,
      number: '',
      added: reused.branch.added,
    });

    await writePinAutoMerge(options, number, reused.branch.head);

    return 0;
  }

  const main = await runCheckedGH(options, [
    'api',
    `repos/${options.repo}/git/ref/heads/main`,
    '--jq',
    '.object.sha',
  ]);

  const mainCommit = main.stdout.trim();

  const shown = await runCheckedGH(options, [
    'api',
    `repos/${options.repo}/contents/${skillsPinPath}?ref=${mainCommit}`,
    '-H',
    'Accept: application/vnd.github.raw',
  ]);

  const mainValue: unknown = JSON.parse(shown.stdout);
  const mainPin = parseSkillsPin(mainValue);

  if (mainPin === options.commit) {
    options.writeOutput(`Pull request #${reused.number} merged with ${options.commit} already.\n`);

    return 0;
  }

  if (mainPin === null || mainPin !== reused.proposed) {
    options.writeOutput(
      `::error::pull request #${reused.number} merged, and main pins ${mainPin ?? 'no full commit ID'}, not ${reused.proposed ?? 'its pin'}; the next dispatch moves the pin\n`,
    );

    return 1;
  }

  options.writeOutput(
    `Pull request #${reused.number} merged, so the run opens a new one from main at ${mainCommit}.\n`,
  );

  const branch = await writePinBranch(options, mainCommit);

  if (branch === null) {
    return 1;
  }

  const number = await writePinPullRequest(options, {
    pinned: mainPin,
    number: '',
    added: branch.added,
  });

  await writePinAutoMerge(options, number, branch.head);

  return 0;
}

if (import.meta.main) {
  process.exitCode = await writeSkillsPinPullRequest({
    cwd: process.cwd(),
    env: process.env,
    commit: process.env['SKILLS_COMMIT'] ?? '',
    repo: process.env['REPO'] ?? '',
    fileSystem: nodeFileSystem,
    runCommand,
    writeOutput: writeStdout,
  });
}
