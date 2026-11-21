import { SceneError } from '../utils/scene-error.ts';
import { formatChange } from './format-change.ts';
import { isBuiltInName } from './is-built-in-name.ts';
import type { AttachedRecord, ChangeRecord, CollectedStages } from './types.ts';

// The words of a part with `at` add to the reading of the change that it names.
export function collectAttachedWords(
  collected: CollectedStages,
  allReferences: ReadonlySet<string>,
): Map<ChangeRecord, number> {
  const extra = new Map<ChangeRecord, number>();
  const changesByID = new Map<string, ChangeRecord>();

  for (const change of collected.changes) {
    if (change.id !== undefined) {
      changesByID.set(change.id, change);
    }
  }

  for (const attached of collected.attached) {
    const target = findAttachedTarget(attached, changesByID, allReferences);

    if (target === undefined) {
      continue;
    }

    if (attached.changesBefore - 1 > target.index) {
      throw new SceneError(
        'at-below-change',
        `${attached.label} joins ${formatChange(target)} but sits below a later change, so the build placed that change without counting its words`,
      );
    }

    const words = attached.parts.reduce((total, part) => total + (part.getNeed().words ?? 0), 0);

    extra.set(target, (extra.get(target) ?? 0) + words);
  }

  return extra;
}

function findAttachedTarget(
  attached: AttachedRecord,
  changesByID: ReadonlyMap<string, ChangeRecord>,
  allReferences: ReadonlySet<string>,
): ChangeRecord | undefined {
  if (!isBuiltInName(attached.at) && !allReferences.has(attached.at)) {
    throw new SceneError(
      'unknown-reference',
      `${attached.label} names "${attached.at}" in at, which matches no change, mark or built-in instant`,
    );
  }

  return changesByID.get(attached.at.split('.')[0] ?? '');
}
