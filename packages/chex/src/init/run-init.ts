import { join } from 'node:path';
import { match } from 'ts-pattern';
import type { InitWrite } from './build-init-plan.ts';
import { buildInitPlan } from './build-init-plan.ts';

export interface InitDeps {
  readonly repoRoot: string;

  // Returns undefined for a file that does not exist.
  readonly readText: (path: string) => Promise<string | undefined>;

  readonly writeText: (path: string, text: string) => Promise<void>;

  readonly renameFile: (from: string, to: string) => Promise<void>;

  // A missing file is no error.
  readonly removeFile: (path: string) => Promise<void>;

  readonly writeOutput: (text: string) => void;

  readonly writeError: (text: string) => void;
}

export async function runInit(deps: InitDeps): Promise<number> {
  const packageText = await deps.readText(join(deps.repoRoot, 'package.json'));
  const lefthookText = await deps.readText(join(deps.repoRoot, 'lefthook.yml'));

  const plan = buildInitPlan(packageText, lefthookText);

  return match(plan)
    .with({ kind: 'refused' }, (refusal) => {
      deps.writeError(refusal.reasons.map((reason) => `chex init: ${reason}\n`).join(''));

      return Promise.resolve(1);
    })
    .with({ kind: 'apply' }, async (apply) => {
      const originals = { 'package.json': packageText, 'lefthook.yml': lefthookText };

      const failure = await writeInitFiles(apply.writes, originals, deps);

      if (failure !== null) {
        deps.writeError(`chex init: ${failure}, so both files stay as they were\n`);

        return 1;
      }

      deps.writeOutput(apply.notes.map((note) => `chex init: ${note}\n`).join(''));

      return 0;
    })
    .exhaustive();
}

type InitOriginals = Readonly<Record<InitWrite['file'], string | undefined>>;

// Writes each file in full beside its target before any target changes, then renames each into
// place, so a failed write never touches a target. Returns the failure, after it puts back each
// target already replaced; null when every file is in place.
async function writeInitFiles(
  writes: readonly InitWrite[],
  originals: InitOriginals,
  deps: InitDeps,
): Promise<string | null> {
  const staged: InitWrite[] = [];

  for (const write of writes) {
    const failure = await settleEffect(deps.writeText(toStagedPath(deps, write.file), write.text));

    if (failure !== null) {
      await removeStagedFiles([...staged, write], deps);

      return `could not write ${write.file}: ${failure}`;
    }

    staged.push(write);
  }

  const replaced: InitWrite[] = [];

  for (const write of staged) {
    const failure = await settleEffect(
      deps.renameFile(toStagedPath(deps, write.file), join(deps.repoRoot, write.file)),
    );

    if (failure !== null) {
      await removeStagedFiles(staged.slice(replaced.length), deps);
      await restoreFiles(replaced, originals, deps);

      return `could not replace ${write.file}: ${failure}`;
    }

    replaced.push(write);
  }

  return null;
}

// Returns the effect's failure as its message, or null when it succeeds.
async function settleEffect(effect: Promise<void>): Promise<string | null> {
  try {
    await effect;

    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function toStagedPath(deps: InitDeps, file: InitWrite['file']): string {
  return join(deps.repoRoot, `${file}.chex-init`);
}

// A staged file that cannot go stays behind; the targets are what init keeps whole.
async function removeStagedFiles(writes: readonly InitWrite[], deps: InitDeps): Promise<void> {
  await Promise.allSettled(writes.map((write) => deps.removeFile(toStagedPath(deps, write.file))));
}

async function restoreFiles(
  replaced: readonly InitWrite[],
  originals: InitOriginals,
  deps: InitDeps,
): Promise<void> {
  for (const write of replaced) {
    const path = join(deps.repoRoot, write.file);
    const original = originals[write.file];

    await (original === undefined ? deps.removeFile(path) : deps.writeText(path, original));
  }
}
