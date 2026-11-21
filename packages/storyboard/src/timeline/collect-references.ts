import { SceneError } from '../utils/scene-error.ts';
import { formatChange } from './format-change.ts';
import { isBuiltInName } from './is-built-in-name.ts';
import type { ChangeRecord } from './types.ts';

// Returns every id and `id.mark` that the changes make, and fails on an id that two changes share
// or that a built-in instant already holds.
export function collectReferences(changes: readonly ChangeRecord[]): Set<string> {
  const references = new Set<string>();
  const ids = new Set<string>();

  for (const change of changes) {
    if (change.id === undefined) {
      continue;
    }

    if (isBuiltInName(change.id)) {
      throw new SceneError(
        'reserved-id',
        `${formatChange(change)} takes the name of a built-in instant`,
      );
    }

    if (change.id.includes('.')) {
      throw new SceneError('duplicate-id', `${formatChange(change)} has a dot in its id`);
    }

    if (ids.has(change.id)) {
      throw new SceneError('duplicate-id', `two changes share the id "${change.id}"`);
    }

    ids.add(change.id);
    references.add(change.id);

    for (const name of change.marksMs.keys()) {
      references.add(`${change.id}.${name}`);
    }
  }

  return references;
}
