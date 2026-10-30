import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { isRecord } from '@zgeoff/std';
import type { Harness } from '../harness.ts';
import { parseSkillGateRules } from '../skill-gate/parse-skill-gate-rules.ts';
import { buildHookPlan } from './build-hook-plan.ts';
import { buildHookSettings } from './build-hook-settings.ts';

const SETTINGS_FILES: readonly { readonly harness: Harness; readonly file: string }[] = [
  { harness: 'claude-code', file: '.claude/settings.json' },
  { harness: 'codex', file: '.codex/hooks.json' },
];

export type InitResult =
  | { readonly ok: true; readonly written: readonly string[] }
  | { readonly ok: false; readonly error: string };

export async function runInit(projectDir: string): Promise<InitResult> {
  const gatedTools = await readGatedTools(projectDir);

  if (typeof gatedTools === 'string') {
    return { ok: false, error: gatedTools };
  }

  const updates: { readonly filePath: string; readonly text: string }[] = [];

  for (const entry of SETTINGS_FILES) {
    const filePath = path.join(projectDir, entry.file);

    const settings = await readSettings(filePath);

    if (typeof settings === 'string') {
      return { ok: false, error: `${entry.file} ${settings}` };
    }

    const updated = buildHookSettings(settings, buildHookPlan(entry.harness, gatedTools));

    if (typeof updated === 'string') {
      return { ok: false, error: `${entry.file}: ${updated}` };
    }

    updates.push({ filePath, text: `${JSON.stringify(updated, null, 2)}\n` });
  }

  for (const update of updates) {
    await mkdir(path.dirname(update.filePath), { recursive: true });

    await Bun.write(update.filePath, update.text);
  }

  return { ok: true, written: SETTINGS_FILES.map((entry) => entry.file) };
}

async function readGatedTools(projectDir: string): Promise<readonly string[] | string> {
  const rulesFile = Bun.file(path.join(projectDir, '.claude', 'skill-gate.json'));

  if (!(await rulesFile.exists())) {
    return [];
  }

  const rulesText = await rulesFile.text();

  const parsed = parseSkillGateRules(rulesText);

  if (!parsed.ok) {
    return `.claude/skill-gate.json ${parsed.error}`;
  }

  return [...new Set(parsed.tools.map((gate) => gate.tool))];
}

async function readSettings(filePath: string): Promise<Readonly<Record<string, unknown>> | string> {
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return {};
  }

  const text = await file.text();

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
