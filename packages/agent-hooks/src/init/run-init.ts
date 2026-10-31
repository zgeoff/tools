import path from 'node:path';
import { buildInitUpdates } from './build-init-updates.ts';
import { INIT_FILES } from './init-files.ts';
import type { InitFileSystem } from './types.ts';

export type InitResult =
  | { readonly ok: true; readonly written: readonly string[] }
  | { readonly ok: false; readonly error: string };

export interface InitOptions {
  readonly projectDir: string;
  readonly fileSystem: InitFileSystem;
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const readProjectText = (file: string) =>
    options.fileSystem.readText(path.join(options.projectDir, file));

  const [stubText, rulesText, ...settingsTexts] = await Promise.all([
    readProjectText(INIT_FILES.stub),
    readProjectText(INIT_FILES.rules),
    ...INIT_FILES.settings.map((entry) => readProjectText(entry.file)),
  ]);

  const plan = buildInitUpdates({
    stubText: stubText ?? null,
    rulesText: rulesText ?? null,
    settingsTexts: Object.fromEntries(
      INIT_FILES.settings.map((entry, index) => [entry.file, settingsTexts[index] ?? null]),
    ),
  });

  if (!plan.ok) {
    return plan;
  }

  for (const update of plan.updates) {
    const error = await writeUpdate(options, update.file, update.text);

    if (error !== null) {
      return { ok: false, error: `${update.file} could not be written: ${error}` };
    }
  }

  return { ok: true, written: plan.updates.map((update) => update.file) };
}

async function writeUpdate(
  options: InitOptions,
  file: string,
  text: string,
): Promise<string | null> {
  try {
    await options.fileSystem.writeText(path.join(options.projectDir, file), text);

    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
