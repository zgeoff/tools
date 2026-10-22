import { statSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { isRecord } from '@zgeoff/std';
import { buildBashChangeOutput } from './build-bash-change-output.ts';
import { buildBashSkillGateOutput } from './build-bash-skill-gate-output.ts';
import { buildSkillGateOutput } from './build-skill-gate-output.ts';
import { collectChangedPaths } from './collect-changed-paths.ts';
import { collectGateSkills } from './collect-gate-skills.ts';
import { collectLoadedSkills } from './collect-loaded-skills.ts';
import { collectWrittenPaths } from './collect-written-paths.ts';
import { parseSkillGateRules } from './parse-skill-gate-rules.ts';
import { planBashSkillGate } from './plan-bash-skill-gate.ts';
import { planSkillGate } from './plan-skill-gate.ts';
import { readCommittedPaths } from './read-committed-paths.ts';
import { readFileHashes } from './read-file-hashes.ts';
import { readWorkTree } from './read-work-tree.ts';
import type {
  BashSnapshot,
  HookEvent,
  PostToolEvent,
  SkillGateRules,
  WrittenPath,
} from './types.ts';

// The hook for Edit, Write, MultiEdit and Bash, which exits once it prints its output. The repo's
// own .claude/skill-gate.json holds the rules; a repo without that file has no gate. A subagent's
// loads come from its own transcript, never the main session's.
export async function runSkillGate(): Promise<never> {
  const payload: unknown = await Bun.stdin.json().catch(() => null);

  const input = parseHookInput(payload);

  if (input === null) {
    process.exit(0);
  }

  // A plain git status refreshes the index under index.lock, which fails a git command that runs
  // beside the hook. simple-git refuses an env it is handed that holds GIT_EDITOR, so set it here.
  process.env['GIT_OPTIONAL_LOCKS'] = '0';

  const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? input.cwd;
  const rulesFile = Bun.file(path.join(projectDir, '.claude', 'skill-gate.json'));

  const hasRules = await rulesFile.exists();

  if (hasRules && input.command !== null) {
    await checkBash({
      hookInput: input,
      command: input.command,
      projectDir,
      rulesText: await rulesFile.text(),
    });
  }

  if (input.filePath === null || input.event !== 'PreToolUse') {
    process.exit(0);
  }

  const filePath = path.resolve(input.cwd, input.filePath);
  const relativePath = toProjectPath(projectDir, filePath);

  if (!hasRules || isOutsideProject(relativePath)) {
    process.exit(0);
  }

  const rulesText = await rulesFile.text();

  const parsed = parseSkillGateRules(rulesText);

  if (!parsed.ok) {
    printOutput(
      buildSkillGateOutput(filePath, { missing: [], unknown: [] }, { rulesError: parsed.error }),
    );

    process.exit(0);
  }

  const availableSkills = await readAvailableSkills(path.join(projectDir, '.claude', 'skills'));
  const transcript = await readTranscript(resolveSessionTranscriptPath(input));

  const loaded = collectLoadedSkills(transcript);

  const plan = planSkillGate({
    rules: parsed.rules,
    relativePath,
    loadedSkills: loaded.skills,
    availableSkills,
  });

  printOutput(buildSkillGateOutput(filePath, plan, { compacted: loaded.compacted }));

  process.exit(0);
}

// An Edit, Write or MultiEdit call carries `file_path`, and a Bash call carries `command`.
interface HookInput {
  readonly event: HookEvent;
  readonly cwd: string;
  readonly filePath: string | null;
  readonly command: string | null;
  readonly transcriptPath: string;
  readonly toolUseID: unknown;
  readonly agentID: unknown;
}

function parseHookInput(value: unknown): HookInput | null {
  if (!isRecord(value) || !isRecord(value['tool_input'])) {
    return null;
  }

  const cwd = value['cwd'];
  const transcriptPath = value['transcript_path'];
  const editPath = value['tool_input']['file_path'];
  const command = value['tool_input']['command'];

  if (typeof cwd !== 'string' || typeof transcriptPath !== 'string') {
    return null;
  }

  if (typeof editPath !== 'string' && typeof command !== 'string') {
    return null;
  }

  return {
    event: pickHookEvent(value['hook_event_name']),
    cwd,
    filePath: typeof editPath === 'string' ? editPath : null,
    command: typeof command === 'string' ? command : null,
    transcriptPath,
    toolUseID: value['tool_use_id'],
    agentID: value['agent_id'],
  };
}

// A payload without an event name is a PreToolUse call, as the hook was first registered.
function pickHookEvent(value: unknown): HookEvent {
  return value === 'PostToolUse' || value === 'PostToolUseFailure' ? value : 'PreToolUse';
}

interface BashCheck {
  readonly hookInput: HookInput;
  readonly command: string;
  readonly projectDir: string;
  readonly rulesText: string;
}

// A broken rules file lets every command through, since the next edit reports it.
async function checkBash(check: BashCheck): Promise<never> {
  const parsedRules = parseSkillGateRules(check.rulesText);

  if (!parsedRules.ok) {
    process.exit(0);
  }

  const snapshotPath = resolveSnapshotPath(check.hookInput);

  if (check.hookInput.event === 'PreToolUse') {
    if (snapshotPath !== null) {
      await writeGatedSnapshot(snapshotPath, check.projectDir, parsedRules.rules);
    }

    await checkBashCommand(check, parsedRules.rules);
  }

  if (snapshotPath !== null && check.hookInput.event !== 'PreToolUse') {
    await checkBashResult(check, parsedRules.rules, {
      event: check.hookInput.event,
      snapshotPath,
    });
  }

  process.exit(0);
}

// Claude Code keeps a session's own files in <session>/ beside its transcript, which a git status
// of the project never lists. Each Bash call gets its own record, so parallel calls never share one.
function resolveSnapshotPath(hookInput: HookInput): string | null {
  if (typeof hookInput.toolUseID !== 'string' || !/^[\w-]+$/u.test(hookInput.toolUseID)) {
    return null;
  }

  const sessionDir = hookInput.transcriptPath.replace(/\.jsonl$/u, '');

  return path.join(sessionDir, 'skill-gate', `${hookInput.toolUseID}.json`);
}

// Records HEAD and the content of each gated file that is dirty before the command runs. A project
// outside a git work tree, or a record the hook cannot write, leaves the command unchecked.
async function writeGatedSnapshot(
  snapshotPath: string,
  projectDir: string,
  rules: SkillGateRules,
): Promise<void> {
  const workTree = await readWorkTree(projectDir);

  if (workTree === null) {
    return;
  }

  const hashes = await readFileHashes(
    projectDir,
    collectGatedProjectPaths(projectDir, rules, workTree.dirtyPaths),
  );

  const snapshot: BashSnapshot = { head: workTree.head, hashes };

  try {
    await mkdir(path.dirname(snapshotPath), { recursive: true });

    await Bun.write(snapshotPath, JSON.stringify(snapshot));
  } catch {
    await rm(snapshotPath, { force: true });
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

// Warns on a command that writes a gated path in the project; any other command goes ahead in
// silence. The check after the command is the one that blocks.
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
  const sessionTranscript = await readTranscript(resolveSessionTranscriptPath(check.hookInput));

  const sessionLoads = collectLoadedSkills(sessionTranscript);

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

async function readAvailableSkills(skillsDir: string): Promise<readonly string[]> {
  const skills: string[] = [];

  const scan = new Bun.Glob('*/SKILL.md').scan({ cwd: skillsDir, followSymlinks: true });

  try {
    for await (const match of scan) {
      skills.push(path.dirname(match));
    }
  } catch {
    // A repo without .claude/skills has no skills, so each rule reports its skills as unknown.
  }

  return skills;
}

async function readTranscript(transcriptPath: string | null): Promise<string> {
  if (transcriptPath === null) {
    return '';
  }

  const transcriptFile = Bun.file(transcriptPath);

  const exists = await transcriptFile.exists();

  return exists ? transcriptFile.text() : '';
}

// A subagent's call carries the main session's transcript_path plus its own agent_id, and Claude
// Code keeps its transcript at <session>/subagents/agent-<agent_id>.jsonl. An agent_id that is not
// a plain name resolves to no transcript, so the edit is denied.
function resolveSessionTranscriptPath(edit: HookInput): string | null {
  if (edit.agentID === undefined) {
    return edit.transcriptPath;
  }

  if (typeof edit.agentID !== 'string' || !/^[\w-]+$/u.test(edit.agentID)) {
    return null;
  }

  const sessionDir = edit.transcriptPath.replace(/\.jsonl$/u, '');

  return path.join(sessionDir, 'subagents', `agent-${edit.agentID}.jsonl`);
}

function printOutput(output: object | null): void {
  if (output !== null) {
    console.log(JSON.stringify(output));
  }
}

interface BashResult {
  readonly event: PostToolEvent;
  readonly snapshotPath: string;
}

// A call with no record, such as one that began before the hook was installed, goes unchecked:
// every file dirty before it would otherwise count as its change. A gated path that a new commit
// holds counts too, unless it was dirty before with the content it has now.
async function checkBashResult(
  check: BashCheck,
  rules: SkillGateRules,
  result: BashResult,
): Promise<void> {
  const before = await readSnapshot(result.snapshotPath);

  await rm(result.snapshotPath, { force: true });

  const workTree = before === null ? null : await readWorkTree(check.projectDir);

  if (before === null || workTree === null) {
    return;
  }

  const committed =
    workTree.head === null || before.head === workTree.head
      ? []
      : await readCommittedPaths(check.projectDir, before.head, workTree.head);

  const candidates = collectGatedProjectPaths(check.projectDir, rules, [
    ...workTree.dirtyPaths,
    ...committed,
  ]);

  const after = await readFileHashes(check.projectDir, [
    ...new Set([...Object.keys(before.hashes), ...candidates]),
  ]);

  const changed = collectChangedPaths(before.hashes, after);

  if (changed.length === 0) {
    return;
  }

  const skills = await readAvailableSkills(path.join(check.projectDir, '.claude', 'skills'));
  const sessionTranscript = await readTranscript(resolveSessionTranscriptPath(check.hookInput));

  const sessionLoads = collectLoadedSkills(sessionTranscript);

  const changePlan = planBashSkillGate({
    rules,
    paths: changed.map((relativePath) => ({
      path: path.join(check.projectDir, relativePath),
      relativePath,
    })),
    loadedSkills: sessionLoads.skills,
    availableSkills: skills,
  });

  printOutput(
    buildBashChangeOutput(result.event, changePlan.gatedPaths, changePlan.missing, {
      compacted: sessionLoads.compacted,
    }),
  );
}

async function readSnapshot(snapshotPath: string): Promise<BashSnapshot | null> {
  const text = await Bun.file(snapshotPath)
    .text()
    .catch(() => null);

  const value: unknown = text === null ? null : parseJSON(text);

  if (!isRecord(value) || !isRecord(value['hashes'])) {
    return null;
  }

  const head = value['head'];

  if (typeof head !== 'string' && head !== null) {
    return null;
  }

  const hashes: Record<string, string | null> = {};

  for (const [relativePath, hash] of Object.entries(value['hashes'])) {
    if (typeof hash !== 'string' && hash !== null) {
      return null;
    }

    hashes[relativePath] = hash;
  }

  return { head, hashes };
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
