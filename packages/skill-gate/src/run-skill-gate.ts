import { statSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { GitError, simpleGit } from 'simple-git';
import type { SimpleGit } from 'simple-git';
import { match } from 'ts-pattern';
import { bashSnapshotSchema } from './bash-snapshot-schema.ts';
import { buildBashChangeOutput } from './build-bash-change-output.ts';
import { buildBashCheckFailureOutput } from './build-bash-check-failure-output.ts';
import { buildBashSkillGateOutput } from './build-bash-skill-gate-output.ts';
import { buildEditOutput } from './build-edit-output.ts';
import { buildToolGateOutput } from './build-tool-gate-output.ts';
import { collectBashCandidates } from './collect-bash-candidates.ts';
import { collectChangedPaths } from './collect-changed-paths.ts';
import { collectGateSkills } from './collect-gate-skills.ts';
import { collectWrittenPaths } from './collect-written-paths.ts';
import type { Harness } from './harness.ts';
import { parseHookInput } from './parse-hook-input.ts';
import { parseSkillGateRules } from './parse-skill-gate-rules.ts';
import { pickCommitRange } from './pick-commit-range.ts';
import { pickComparisonStep } from './pick-comparison-step.ts';
import { pickRecordStep } from './pick-record-step.ts';
import { planBashSkillGate } from './plan-bash-skill-gate.ts';
import { planSkillGate } from './plan-skill-gate.ts';
import { planToolGate } from './plan-tool-gate.ts';
import { readAvailableReferences } from './read-available-references.ts';
import { readAvailableSkills } from './read-available-skills.ts';
import { readCommitHashes } from './read-commit-hashes.ts';
import { readCommittedPaths } from './read-committed-paths.ts';
import { readFileContent } from './read-file-content.ts';
import { readFileHashes } from './read-file-hashes.ts';
import { readProjectDir } from './read-project-dir.ts';
import { readSessionLoads } from './read-session-loads.ts';
import { readWorkTree } from './read-work-tree.ts';
import { recordCommandReads, recordLifecycle } from './record-codex-loads.ts';
import { resolveStateDir } from './resolve-state-dir.ts';
import type {
  BashComparison,
  BashResultStep,
  BashSnapshot,
  HookInput,
  PostToolEvent,
  RecordedSnapshot,
  SkillGateRules,
  WrittenPath,
} from './types.ts';

export async function runSkillGate(harness: Harness = 'claude-code'): Promise<never> {
  const payload: unknown = await Bun.stdin.json().catch(() => null);

  const parsedInput = parseHookInput(harness, payload);

  if (parsedInput === null) {
    process.exit(0);
  }

  // A plain git status refreshes the index under index.lock, which fails a git command that runs
  // beside the hook. simple-git refuses an env it is handed that holds GIT_EDITOR, so set it here.
  process.env['GIT_OPTIONAL_LOCKS'] = '0';

  const projectDir = await readProjectDir(parsedInput.cwd);

  const rulesFile = Bun.file(path.join(projectDir, '.claude', 'skill-gate.json'));

  const hasRules = await rulesFile.exists();

  if (parsedInput.kind === 'lifecycle') {
    if (hasRules) {
      await recordLifecycle(parsedInput, projectDir);
    }

    process.exit(0);
  }

  const input = parsedInput;

  if (hasRules && input.toolName !== null && input.event === 'PreToolUse') {
    await checkToolCall({
      hookInput: input,
      toolName: input.toolName,
      projectDir,
      rulesText: await rulesFile.text(),
    });
  }

  if (hasRules && input.command !== null) {
    const rulesText = await rulesFile.text();

    if (input.harness === 'codex' && input.event === 'PostToolUse') {
      await recordCommandReads(input, input.command, projectDir, rulesText);
    }

    await checkBash({ hookInput: input, command: input.command, projectDir, rulesText });
  }

  if (input.editPaths.length === 0 || input.event !== 'PreToolUse') {
    process.exit(0);
  }

  const edits = input.editPaths
    .map((editPath) => path.resolve(input.cwd, editPath))
    .map((filePath) => ({ filePath, relativePath: toProjectPath(projectDir, filePath) }))
    .filter((edit) => !isOutsideProject(edit.relativePath));

  if (!hasRules || edits.length === 0) {
    process.exit(0);
  }

  const rulesText = await rulesFile.text();

  const parsed = parseSkillGateRules(rulesText);

  if (!parsed.ok) {
    const emptyPlan = { missing: [], unknown: [] };
    const unchecked = edits.map((edit) => ({ filePath: edit.filePath, plan: emptyPlan }));

    printOutput(buildEditOutput(input.harness, unchecked, { rulesError: parsed.error }));

    process.exit(0);
  }

  const availableSkills = await readAvailableSkills(path.join(projectDir, '.claude', 'skills'));
  const loaded = await readSessionLoads(input);

  const entries = edits.map((edit) => ({
    filePath: edit.filePath,
    plan: planSkillGate({
      rules: parsed.rules,
      relativePath: edit.relativePath,
      loadedSkills: loaded.skills,
      availableSkills,
    }),
  }));

  printOutput(
    buildEditOutput(input.harness, entries, {
      compacted: loaded.compacted,
      unknownKeys: parsed.unknownKeys,
    }),
  );

  process.exit(0);
}

const PATH_GATED_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'Bash', 'apply_patch']);

interface ToolCallCheck {
  readonly hookInput: HookInput;
  readonly toolName: string;
  readonly projectDir: string;
  readonly rulesText: string;
}

async function checkToolCall(check: ToolCallCheck): Promise<void> {
  const parsedRules = parseSkillGateRules(check.rulesText);

  if (!parsedRules.ok) {
    // The hook matcher names only gated tools beside the path-gated ones, so a broken rules file
    // warns on each such call and lets it through.
    if (!PATH_GATED_TOOLS.has(check.toolName)) {
      printOutput(
        buildToolGateOutput(
          check.toolName,
          { missingSkills: [], missingReferences: [], unknown: [] },
          { rulesError: parsedRules.error },
        ),
      );

      process.exit(0);
    }

    return;
  }

  if (!parsedRules.tools.some((gate) => gate.tool === check.toolName)) {
    return;
  }

  const skillsDir = path.join(check.projectDir, '.claude', 'skills');

  const loads = await readSessionLoads(check.hookInput);

  const plan = planToolGate({
    tools: parsedRules.tools,
    toolName: check.toolName,
    skillsDir,
    loads,
    availableSkills: await readAvailableSkills(skillsDir),
    availableReferences: await readAvailableReferences(
      readFileContent,
      skillsDir,
      parsedRules.tools,
    ),
  });

  printOutput(
    buildToolGateOutput(check.toolName, plan, {
      harness: check.hookInput.harness,
      compacted: loads.compacted,
      unknownKeys: parsedRules.unknownKeys,
    }),
  );

  process.exit(0);
}

function printOutput(output: object | null): void {
  if (output !== null) {
    console.log(JSON.stringify(output));
  }
}

interface BashCheck {
  readonly hookInput: HookInput;
  readonly command: string;
  readonly projectDir: string;
  readonly rulesText: string;
}

async function checkBash(check: BashCheck): Promise<never> {
  const parsedRules = parseSkillGateRules(check.rulesText);

  if (!parsedRules.ok) {
    process.exit(0);
  }

  const snapshotPath = resolveSnapshotPath(check.hookInput);
  const git = simpleGit(check.projectDir);

  if (check.hookInput.event === 'PreToolUse') {
    if (snapshotPath !== null) {
      await writeGatedSnapshot(git, snapshotPath, check.projectDir, parsedRules.rules);
    }

    await checkBashCommand(check, parsedRules.rules);
  }

  if (snapshotPath !== null && check.hookInput.event !== 'PreToolUse') {
    await checkBashResult(check, parsedRules.rules, {
      git,
      event: check.hookInput.event,
      snapshotPath,
    });
  }

  process.exit(0);
}

function resolveSnapshotPath(hookInput: HookInput): string | null {
  if (typeof hookInput.toolUseID !== 'string' || !/^[\w-]+$/u.test(hookInput.toolUseID)) {
    return null;
  }

  const stateDir = resolveStateDir(hookInput);

  return stateDir === null ? null : path.join(stateDir, `${hookInput.toolUseID}.json`);
}

async function writeGatedSnapshot(
  git: SimpleGit,
  snapshotPath: string,
  projectDir: string,
  rules: SkillGateRules,
): Promise<void> {
  const snapshot = await readGatedSnapshot(git, projectDir, rules);

  if (snapshot === null) {
    return;
  }

  try {
    await mkdir(path.dirname(snapshotPath), { recursive: true });

    await Bun.write(snapshotPath, JSON.stringify(snapshot));
  } catch {
    await rm(snapshotPath, { force: true });
  }
}

async function readGatedSnapshot(
  git: SimpleGit,
  projectDir: string,
  rules: SkillGateRules,
): Promise<BashSnapshot | null> {
  try {
    const workTree = await readWorkTree(git, projectDir);

    if (workTree === null) {
      return null;
    }

    const hashes = await readFileHashes(
      readFileContent,
      projectDir,
      collectGatedProjectPaths(projectDir, rules, workTree.dirtyPaths),
    );

    return { kind: 'recorded', head: workTree.head, hashes };
  } catch (error) {
    if (error instanceof GitError) {
      return { kind: 'failed', error: error.message };
    }

    throw error;
  }
}

function collectGatedProjectPaths(
  projectDir: string,
  rules: SkillGateRules,
  absolutePaths: readonly string[],
): readonly string[] {
  return [...new Set(absolutePaths.map((entry) => toProjectPath(projectDir, entry)))].filter(
    (relativePath) =>
      !isOutsideProject(relativePath) && collectGateSkills(rules, relativePath).length > 0,
  );
}

function toProjectPath(projectDir: string, absolute: string): string {
  return path.relative(projectDir, absolute).split(path.sep).join('/');
}

function isOutsideProject(fromProject: string): boolean {
  return fromProject === '..' || fromProject.startsWith('../') || path.isAbsolute(fromProject);
}

async function checkBashCommand(check: BashCheck, rules: SkillGateRules): Promise<void> {
  const written = collectWrittenPaths(check.command).map((entry) =>
    readWrittenPath(check.hookInput.cwd, entry),
  );

  const candidates = [...new Set(written)].filter(
    (entry) => !isOutsideProject(toProjectPath(check.projectDir, entry)),
  );

  if (candidates.length === 0) {
    return;
  }

  const skills = await readAvailableSkills(path.join(check.projectDir, '.claude', 'skills'));
  const sessionLoads = await readSessionLoads(check.hookInput);

  const bashPlan = planBashSkillGate({
    rules,
    paths: candidates.map((entry) => ({
      path: entry,
      relativePath: toProjectPath(check.projectDir, entry),
    })),
    loadedSkills: sessionLoads.skills,
    availableSkills: skills,
  });

  printOutput(
    buildBashSkillGateOutput(bashPlan.gatedPaths, bashPlan.missing, {
      harness: check.hookInput.harness,
      compacted: sessionLoads.compacted,
    }),
  );
}

// A `cp` or `mv` onto an existing directory writes the source's file name inside it.
function readWrittenPath(cwd: string, written: WrittenPath): string {
  const absolute = path.resolve(cwd, written.path);

  if (written.fileName === undefined) {
    return absolute;
  }

  const isDirectory = statSync(absolute, { throwIfNoEntry: false })?.isDirectory() === true;

  return isDirectory ? path.join(absolute, written.fileName) : absolute;
}

interface BashResult {
  readonly git: SimpleGit;
  readonly event: PostToolEvent;
  readonly snapshotPath: string;
}

async function checkBashResult(
  check: BashCheck,
  rules: SkillGateRules,
  result: BashResult,
): Promise<void> {
  const record = await readSnapshot(result.snapshotPath);

  await rm(result.snapshotPath, { force: true });

  const recordStep = pickRecordStep(record);

  if (recordStep.kind !== 'compare') {
    await runBashResultStep(check, rules, result, recordStep);

    return;
  }

  const comparison = await readComparison(check, rules, result, recordStep.recorded);

  await runBashResultStep(check, rules, result, pickComparisonStep(comparison));
}

async function readSnapshot(snapshotPath: string): Promise<BashSnapshot | null> {
  const text = await Bun.file(snapshotPath)
    .text()
    .catch(() => null);

  const value: unknown = text === null ? null : parseJSON(text);
  const parsed = bashSnapshotSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function runBashResultStep(
  check: BashCheck,
  rules: SkillGateRules,
  result: BashResult,
  step: BashResultStep,
): Promise<void> {
  await match(step)
    .with({ kind: 'skip' }, () => Promise.resolve())
    .with({ kind: 'report' }, (report) => {
      printOutput(buildBashCheckFailureOutput(result.event, report.error));

      return Promise.resolve();
    })
    .with({ kind: 'gate' }, (gate) => checkChangedPaths(check, rules, result, gate.changedPaths))
    .exhaustive();
}

async function checkChangedPaths(
  check: BashCheck,
  rules: SkillGateRules,
  result: BashResult,
  changedPaths: readonly string[],
): Promise<void> {
  const skills = await readAvailableSkills(path.join(check.projectDir, '.claude', 'skills'));
  const sessionLoads = await readSessionLoads(check.hookInput);

  const changePlan = planBashSkillGate({
    rules,
    paths: changedPaths.map((relativePath) => ({
      path: path.join(check.projectDir, relativePath),
      relativePath,
    })),
    loadedSkills: sessionLoads.skills,
    availableSkills: skills,
  });

  printOutput(
    buildBashChangeOutput(result.event, changePlan.gatedPaths, changePlan.missing, {
      harness: check.hookInput.harness,
      compacted: sessionLoads.compacted,
    }),
  );
}

async function readComparison(
  check: BashCheck,
  rules: SkillGateRules,
  result: BashResult,
  before: RecordedSnapshot,
): Promise<BashComparison> {
  try {
    const workTree = await readWorkTree(result.git, check.projectDir);

    if (workTree === null) {
      return { kind: 'no-work-tree' };
    }

    const range = pickCommitRange(before.head, workTree.head);

    const committed =
      range === null
        ? []
        : await readCommittedPaths(result.git, check.projectDir, range.from, range.to);

    const candidates = collectBashCandidates(
      before.hashes,
      collectGatedProjectPaths(check.projectDir, rules, [...workTree.dirtyPaths, ...committed]),
    );

    const after = await readFileHashes(readFileContent, check.projectDir, candidates.hashedPaths);
    const atHead = await readCommitHashes(result.git, before.head, candidates.cleanBefore);

    return { kind: 'compared', changedPaths: collectChangedPaths(before.hashes, atHead, after) };
  } catch (error) {
    if (error instanceof GitError) {
      return { kind: 'git-failed', error: error.message };
    }

    throw error;
  }
}
