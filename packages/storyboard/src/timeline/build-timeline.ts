import type { EffectNode, HostNode, Placed, Reference, StoryNode } from '../types.ts';
import { SceneError } from '../utils/scene-error.ts';
import { collectActingSpans } from './collect-acting-spans.ts';
import { collectAttachedWords } from './collect-attached-words.ts';
import { collectChanges } from './collect-changes.ts';
import { collectReferences } from './collect-references.ts';
import { formatChange } from './format-change.ts';
import { placeChanges } from './place-changes.ts';
import type { Instant, Placement } from './place-changes.ts';
import type { ChangeRecord, Timeline } from './types.ts';

// Builds the timeline in two passes: the first collects each part's need and the second places
// every change on the grid. It also hands each host the deliveries that the placed parts write.
export function buildTimeline(root: StoryNode, stageS: number): Timeline {
  const collected = collectChanges(root);

  if (collected.stages.length === 0) {
    throw new SceneError('bad-scene', 'a scene needs at least one <Stage>');
  }

  const allReferences = collectReferences(collected.changes);
  const extraWords = collectAttachedWords(collected, allReferences);
  const stageMs = Math.round(stageS * 1000);
  const placement = placeChanges({ collected, stageMs, extraWords, allReferences });
  const loopS = (stageMs * collected.stages.length) / 1000;
  const resetS = loopS - 1;
  const session = {};

  const placements = new Map<EffectNode, Placed>();
  const writtenHosts = new Set<HostNode<unknown>>();

  for (const change of collected.changes) {
    const atMs = placement.changeTimesMs.get(change) ?? 0;

    for (const part of change.parts) {
      placements.set(part, buildPlaced(atMs, part, change));
      part.deliverAt(session, atMs / 1000);

      if (part.host !== undefined) {
        writtenHosts.add(part.host);
      }
    }
  }

  for (const attached of collected.attached) {
    const atMs = getInstant(placement, attached.at, attached.label).timeMs;

    for (const part of attached.parts) {
      placements.set(part, buildPlaced(atMs, part, undefined));
      part.deliverAt(session, atMs / 1000);

      if (part.host !== undefined) {
        writtenHosts.add(part.host);
      }
    }
  }

  return {
    session,
    stageS,
    loopS,
    resetS,
    stages: collected.stages.map((stage, index) => ({
      caption: stage.caption,
      startS: index * stageS,
    })),
    tokens: collected.stages[0]?.tokens ?? {},
    placements,
    acting: collectActingSpans(collected.changes, placement.changeTimesMs, resetS, stageS),
    writtenHosts,
    find: (reference) => getInstant(placement, reference, 'a reference').timeMs / 1000,
  };
}

function buildPlaced(atMs: number, part: EffectNode, change: ChangeRecord | undefined): Placed {
  const changeMarksMs = change?.marksMs ?? new Map<string, number>();
  const ownMarks = part.getNeed().marks ?? {};

  return {
    at: atMs / 1000,
    mark(name) {
      const ownSeconds = ownMarks[name];
      const offsetMs = ownSeconds === undefined ? changeMarksMs.get(name) : ownSeconds * 1000;

      if (offsetMs === undefined) {
        const where = change === undefined ? '' : ` in ${formatChange(change)}`;

        throw new SceneError(
          'unknown-reference',
          `${part.label}${where} has no mark named "${name}"`,
        );
      }

      return (atMs + offsetMs) / 1000;
    },
  };
}

function getInstant(placement: Placement, reference: Reference, whoAsks: string): Instant {
  const instant = placement.instants.get(reference);

  if (instant === undefined) {
    throw new SceneError(
      'unknown-reference',
      `${whoAsks} names "${reference}", which matches no change, mark or built-in instant`,
    );
  }

  return instant;
}
