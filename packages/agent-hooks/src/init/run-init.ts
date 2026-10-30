import path from 'node:path';
import { isRecord } from '@zgeoff/std';
import type { Harness } from '../harness.ts';
import { parseSkillGateRules } from '../skill-gate/parse-skill-gate-rules.ts';
import { buildHookPlan } from './build-hook-plan.ts';
import { buildHookSettings } from './build-hook-settings.ts';
import type { InitFileSystem } from './types.ts';

const SETTINGS_FILES: readonly { readonly harness: Harness; readonly file: string }[] = [
  { harness: 'claude-code', file: '.claude/settings.json' },
  { harness: 'codex', file: '.codex/hooks.json' },
];

export type InitResult =
  | { readonly ok: true; readonly written: readonly string[] }
  | { readonly ok: false; readonly error: string };

export interface InitOptions {
  readonly projectDir: string;
  readonly fileSystem: InitFileSystem;
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const gatedTools = await readGatedTools(options);

  if (typeof gatedTools === 'string') {
    return { ok: false, error: gatedTools };
  }

  const updates: { readonly file: string; readonly filePath: string; readonly text: string }[] = [];

  for (const entry of SETTINGS_FILES) {
    const filePath = path.join(options.projectDir, entry.file);

    const settings = await readSettings(options.fileSystem, filePath);

    if (typeof settings === 'string') {
      return { ok: false, error: `${entry.file} ${settings}` };
    }

    const updated = buildHookSettings(settings, buildHookPlan(entry.harness, gatedTools));

    if (typeof updated === 'string') {
      return { ok: false, error: `${entry.file}: ${updated}` };
    }

    updates.push({ file: entry.file, filePath, text: `${JSON.stringify(updated, null, 2)}\n` });
  }

  for (const update of updates) {
    const error = await writeUpdate(options.fileSystem, update.filePath, update.text);

    if (error !== null) {
      return { ok: false, error: `${update.file} could not be written: ${error}` };
    }
  }

  return { ok: true, written: SETTINGS_FILES.map((entry) => entry.file) };
}

async function readGatedTools(options: InitOptions): Promise<readonly string[] | string> {
  const rulesText = await options.fileSystem.readText(
    path.join(options.projectDir, '.claude', 'skill-gate.json'),
  );

  if (rulesText === null) {
    return [];
  }

  const parsed = parseSkillGateRules(rulesText);

  if (!parsed.ok) {
    return `.claude/skill-gate.json ${parsed.error}`;
  }

  return [...new Set(parsed.tools.map((gate) => gate.tool))];
}

async function readSettings(
  fileSystem: InitFileSystem,
  filePath: string,
): Promise<Readonly<Record<string, unknown>> | string> {
  const text = await fileSystem.readText(filePath);

  if (text === null) {
    return {};
  }

  const value = parseJSON(text);

  if (value instanceof Error) {
    return `is not valid JSON: ${value.message}`;
  }

  return isRecord(value) ? value : 'must hold a JSON object';
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

async function writeUpdate(
  fileSystem: InitFileSystem,
  filePath: string,
  text: string,
): Promise<string | null> {
  try {
    await fileSystem.writeText(filePath, text);

    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
