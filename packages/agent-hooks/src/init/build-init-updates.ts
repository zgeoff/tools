import { isRecord } from '@zgeoff/std';
import { parseSkillGateRules } from '../skill-gate/parse-skill-gate-rules.ts';
import { buildHookPlan } from './build-hook-plan.ts';
import { buildHookSettings } from './build-hook-settings.ts';
import { INIT_FILES } from './init-files.ts';

export interface InitInputs {
  // Each text is null when its file is missing.
  readonly stubText: string | null;
  readonly rulesText: string | null;
  readonly settingsTexts: Readonly<Record<string, string | null>>;
}

export type InitUpdates =
  | {
      readonly ok: true;
      readonly updates: readonly { readonly file: string; readonly text: string }[];
    }
  | { readonly ok: false; readonly error: string };

export function buildInitUpdates(inputs: InitInputs): InitUpdates {
  if (inputs.stubText === null) {
    return {
      ok: false,
      error: `${INIT_FILES.stub} is missing. Take the hook-start entry of repo-sync and merge its pull request, then run agent-hooks init again.`,
    };
  }

  const gatedTools = parseGatedTools(inputs.rulesText);

  if (typeof gatedTools === 'string') {
    return { ok: false, error: gatedTools };
  }

  const updates: { readonly file: string; readonly text: string }[] = [];

  for (const entry of INIT_FILES.settings) {
    const settings = parseSettings(inputs.settingsTexts[entry.file] ?? null);

    if (typeof settings === 'string') {
      return { ok: false, error: `${entry.file} ${settings}` };
    }

    const updated = buildHookSettings(settings, buildHookPlan(entry.harness, gatedTools));

    if (typeof updated === 'string') {
      return { ok: false, error: `${entry.file}: ${updated}` };
    }

    updates.push({ file: entry.file, text: `${JSON.stringify(updated, null, 2)}\n` });
  }

  return { ok: true, updates };
}

function parseGatedTools(rulesText: string | null): readonly string[] | string {
  if (rulesText === null) {
    return [];
  }

  const parsed = parseSkillGateRules(rulesText);

  if (!parsed.ok) {
    return `${INIT_FILES.rules} ${parsed.error}`;
  }

  return [...new Set(parsed.tools.map((gate) => gate.tool))];
}

function parseSettings(text: string | null): Readonly<Record<string, unknown>> | string {
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
