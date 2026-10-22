import { isRecord } from '@zgeoff/std';
import type { SkillGate, SkillGateRulesResult, ToolGate } from './types.ts';

// `match` globs the path relative to the project root. A key the parser does not know is skipped,
// not refused, so a rules file written for a later version of the package still gates.
export function parseSkillGateRules(text: string): SkillGateRulesResult {
  const value = parseJSON(text);

  if (value instanceof Error) {
    return { ok: false, error: `is not valid JSON: ${value.message}` };
  }

  if (!isRecord(value)) {
    return { ok: false, error: 'must hold a JSON object' };
  }

  return parseRulesRecord(value);
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

const RULES_KEYS = ['ignore', 'gates', 'tools'];
const PATH_GATE_KEYS = ['match', 'skills'];
const TOOL_GATE_KEYS = ['tool', 'skills', 'references'];

function parseRulesRecord(value: Readonly<Record<string, unknown>>): SkillGateRulesResult {
  const ignore = value['ignore'] ?? [];

  if (!isStringArray(ignore)) {
    return { ok: false, error: '`ignore` must be an array of non-empty strings' };
  }

  const gates = value['gates'];

  if (!Array.isArray(gates)) {
    return { ok: false, error: '`gates` must be an array' };
  }

  const tools = value['tools'] ?? [];

  if (!Array.isArray(tools)) {
    return { ok: false, error: '`tools` must be an array' };
  }

  const parsedGates = gates.map((gate, index) => parseGate(gate, index));
  const parsedTools = tools.map((gate, index) => parseToolGate(gate, index));
  const error = [...parsedGates, ...parsedTools].find((gate) => typeof gate === 'string');

  if (typeof error === 'string') {
    return { ok: false, error };
  }

  return {
    ok: true,
    rules: { ignore, gates: parsedGates.filter((gate) => typeof gate !== 'string') },
    tools: parsedTools.filter((gate) => typeof gate !== 'string'),
    unknownKeys: [
      ...collectUnknownKeys(value, RULES_KEYS, ''),
      ...gates.flatMap((gate, index) =>
        collectUnknownKeys(gate, PATH_GATE_KEYS, `gates[${index}].`),
      ),
      ...tools.flatMap((gate, index) =>
        collectUnknownKeys(gate, TOOL_GATE_KEYS, `tools[${index}].`),
      ),
    ],
  };
}

// An empty string would match every path as an ignore segment, and no session can load it as a skill.
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item !== '');
}

function parseGate(gate: unknown, index: number): SkillGate | string {
  if (!isRecord(gate) || typeof gate['match'] !== 'string' || gate['match'] === '') {
    return `gate ${index} needs a non-empty string \`match\``;
  }

  const skills = gate['skills'];

  if (!isStringArray(skills) || skills.length === 0) {
    return `gate "${gate['match']}" needs a non-empty \`skills\` array of non-empty strings`;
  }

  return { match: gate['match'], skills };
}

// Path gates cover these tools, so a tool gate on one would skip its path check.
const PATH_GATED_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'Bash']);

function parseToolGate(gate: unknown, index: number): ToolGate | string {
  if (!isRecord(gate) || typeof gate['tool'] !== 'string' || gate['tool'] === '') {
    return `tool gate ${index} needs a non-empty string \`tool\``;
  }

  const tool = gate['tool'];

  if (PATH_GATED_TOOLS.has(tool)) {
    return `tool gate "${tool}" names a tool that path gates cover; gate its paths in \`gates\``;
  }

  const skills = gate['skills'] ?? [];
  const references = gate['references'] ?? [];

  if (!isStringArray(skills) || !isStringArray(references)) {
    return `tool gate "${tool}" needs \`skills\` and \`references\` arrays of non-empty strings`;
  }

  if (skills.length === 0 && references.length === 0) {
    return `tool gate "${tool}" needs at least one skill or reference`;
  }

  const outside = references.find((reference) => !isSkillsPath(reference));

  if (outside !== undefined) {
    return `tool gate "${tool}" names the reference "${outside}", which is not a path inside .claude/skills/`;
  }

  return { tool, skills, references };
}

function isSkillsPath(reference: string): boolean {
  return !reference.startsWith('/') && !reference.split('/').includes('..');
}

function collectUnknownKeys(
  value: unknown,
  knownKeys: readonly string[],
  prefix: string,
): readonly string[] {
  if (!isRecord(value)) {
    return [];
  }

  return Object.keys(value)
    .filter((key) => !knownKeys.includes(key))
    .map((key) => `${prefix}${key}`);
}
