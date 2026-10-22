// The skill gate's entry point, which repo-sync delivers from zgeoff/tools. The gate lives in
// @zgeoff/skill-gate, which the repo installs at its root.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

// Claude Code runs the call when a PreToolUse hook exits with any status but 2, so a static import
// that fails would let a gated edit through. This file therefore imports only Node builtins.
const runGate = await import('@zgeoff/skill-gate').then(
  (gate) => gate.runSkillGate,
  (error: unknown) => () => reportLoadFailure(formatError(error)),
);

await runGate();

// Bun rejects a failed import with a ResolveMessage, which is not an Error.
function formatError(error: unknown): string {
  if (isRecord(error) && typeof error['message'] === 'string') {
    return error['message'];
  }

  return String(error);
}

async function reportLoadFailure(loadError: string): Promise<never> {
  const payload: unknown = await Bun.stdin.json().catch(() => null);

  const edit = parseEdit(payload, process.env['CLAUDE_PROJECT_DIR']);

  const isGated = await probeGatedEdit(edit);

  if (edit !== null && isGated) {
    console.error(
      `The skill gate cannot load, so it blocks this edit to ${edit.filePath}: ${loadError}. Run \`bun install\` at the repo root, then retry the edit.`,
    );

    process.exit(2);
  }

  const toolCall = parseToolCall(payload, process.env['CLAUDE_PROJECT_DIR']);

  const isGatedTool = await probeGatedToolCall(toolCall, readTextFile);

  if (toolCall !== null && isGatedTool) {
    console.error(
      `The skill gate cannot load, so it blocks this call to ${toolCall.toolName}: ${loadError}. Run \`bun install\` at the repo root, then retry the call.`,
    );

    process.exit(2);
  }

  console.error(`The skill gate cannot load: ${loadError}`);
  process.exit(1);
}

interface Edit {
  readonly projectDir: string;
  readonly filePath: string;
}

// Only an Edit, Write or MultiEdit call carries `file_path`; a Bash call goes unchecked here.
function parseEdit(payload: unknown, projectDir: string | undefined): Edit | null {
  if (!isRecord(payload) || !isRecord(payload['tool_input'])) {
    return null;
  }

  const cwd = payload['cwd'];
  const filePath = payload['tool_input']['file_path'];

  if (typeof cwd !== 'string' || typeof filePath !== 'string') {
    return null;
  }

  return {
    projectDir: projectDir ?? cwd,
    filePath: path.resolve(cwd, filePath),
  };
}

async function probeGatedEdit(edit: Edit | null): Promise<boolean> {
  if (edit === null) {
    return false;
  }

  const relativePath = path.relative(edit.projectDir, edit.filePath).split(path.sep).join('/');

  if (relativePath === '..' || relativePath.startsWith('../') || path.isAbsolute(relativePath)) {
    return false;
  }

  const rulesText = await readTextFile(
    path.join(edit.projectDir, '.claude', 'skill-gate.json'),
  ).catch((error: unknown) => {
    console.error(`The skill gate cannot read .claude/skill-gate.json: ${formatError(error)}`);

    return null;
  });

  if (rulesText === undefined) {
    return false;
  }

  return rulesText === null || isGatedPath(rulesText, relativePath);
}

function isGatedPath(rulesText: string, relativePath: string): boolean {
  const rules = parseRules(rulesText);

  if (rules === null) {
    return true;
  }

  if (rules.ignore.some((segment) => relativePath.includes(segment))) {
    return false;
  }

  return rules.matches.some((match) => new Bun.Glob(match).match(relativePath));
}

interface Rules {
  readonly ignore: readonly string[];
  readonly matches: readonly string[];
}

function parseRules(text: string): Rules | null {
  const value = parseJSON(text);

  if (!isRecord(value)) {
    return null;
  }

  const ignore = value['ignore'] ?? [];
  const gates = value['gates'];

  if (!isStringArray(ignore) || !Array.isArray(gates)) {
    return null;
  }

  const matches = gates.map((entry: unknown) =>
    isRecord(entry) &&
    typeof entry['match'] === 'string' &&
    entry['match'] !== '' &&
    isStringArray(entry['skills']) &&
    entry['skills'].length > 0
      ? entry['match']
      : null,
  );

  if (matches.includes(null)) {
    return null;
  }

  return { ignore, matches: matches.filter((match) => match !== null) };
}

interface ToolCall {
  readonly projectDir: string;
  readonly toolName: string;
}

function parseToolCall(payload: unknown, projectDir: string | undefined): ToolCall | null {
  if (!isRecord(payload)) {
    return null;
  }

  const cwd = payload['cwd'];
  const toolName = payload['tool_name'];

  if (typeof cwd !== 'string' || typeof toolName !== 'string') {
    return null;
  }

  return { projectDir: projectDir ?? cwd, toolName };
}

// A rules file that cannot be read or parsed, or whose `tools` list does not parse, blocks every
// call that reaches the hook other than an edit or a Bash command, since the hook matcher names only
// gated tools beside those.
async function probeGatedToolCall(toolCall: ToolCall | null, readText: ReadText): Promise<boolean> {
  if (toolCall === null || ['Edit', 'Write', 'MultiEdit', 'Bash'].includes(toolCall.toolName)) {
    return false;
  }

  const rulesText = await readText(
    path.join(toolCall.projectDir, '.claude', 'skill-gate.json'),
  ).catch(() => null);

  if (rulesText === undefined) {
    return false;
  }

  const tools = rulesText === null ? null : parseGatedTools(rulesText);

  return tools === null || tools.includes(toolCall.toolName);
}

// Reads a file's text, or undefined for a path that holds no file; a file it cannot read rejects.
type ReadText = (filePath: string) => Promise<string | undefined>;

// Bun.file(...).exists() is false for a folder, so the hook stats the path instead.
async function readTextFile(filePath: string): Promise<string | undefined> {
  const isPresent = await probePath(filePath);

  return isPresent ? readFile(filePath, 'utf8') : undefined;
}

// Only a path that names nothing is absent, so a path the hook cannot stat counts as present and
// its read fails.
async function probePath(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);

    return true;
  } catch (error) {
    return !(isRecord(error) && (error['code'] === 'ENOENT' || error['code'] === 'ENOTDIR'));
  }
}

function parseGatedTools(text: string): readonly string[] | null {
  const value = parseJSON(text);

  if (!isRecord(value)) {
    return null;
  }

  const tools = value['tools'] ?? [];

  if (!Array.isArray(tools)) {
    return null;
  }

  const names = tools.map((entry: unknown) =>
    isRecord(entry) && typeof entry['tool'] === 'string' ? entry['tool'] : null,
  );

  return names.includes(null) ? null : names.filter((name) => name !== null);
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item !== '');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
