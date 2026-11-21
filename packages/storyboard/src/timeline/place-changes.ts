import type { After } from '../types.ts';
import { SceneError } from '../utils/scene-error.ts';
import { formatChange } from './format-change.ts';
import type { ChangeRecord, CollectedStages, StageRecord } from './types.ts';

export interface Instant {
  readonly timeMs: number;

  // The index of the change that makes the instant, or -1 for a built-in one.
  readonly changeIndex: number;
}

export interface Placement {
  readonly instants: ReadonlyMap<string, Instant>;
  readonly changeTimesMs: ReadonlyMap<ChangeRecord, number>;
}

interface PlaceInput {
  readonly collected: CollectedStages;
  readonly stageMs: number;

  // The words that parts joined with `at` add to each change.
  readonly extraWords: ReadonlyMap<ChangeRecord, number>;

  // Every id and `id.mark` of every change, placed or not.
  readonly allReferences: ReadonlySet<string>;
}

const GRID_MS = 500;

// The second pass over the changes: puts each one on the first grid step that every rule of the
// timing allows, in JSX order.
export function placeChanges(input: PlaceInput): Placement {
  const stageCount = input.collected.stages.length;

  const instants = new Map<string, Instant>(listBuiltInInstants(stageCount, input.stageMs));
  const changeTimesMs = new Map<ChangeRecord, number>();

  input.collected.stages.forEach((stage, stageIndex) => {
    const startMs = stageIndex * input.stageMs;
    const isLast = stageIndex === stageCount - 1;

    placeStage(
      stage,
      input,
      { instants, changeTimesMs },
      {
        stageIndex,
        startMs,
        windowStartMs: startMs + GRID_MS,
        windowEndMs: isLast
          ? input.stageMs * stageCount - 2 * GRID_MS
          : startMs + input.stageMs - GRID_MS,
        isLast,
      },
    );
  });

  return { instants, changeTimesMs };
}

function listBuiltInInstants(stageCount: number, stageMs: number): [string, Instant][] {
  const entries: [string, Instant][] = [
    ['start', { timeMs: 0, changeIndex: -1 }],
    ['reset', { timeMs: stageMs * stageCount - 2 * GRID_MS, changeIndex: -1 }],
  ];

  for (let stage = 2; stage <= stageCount; stage += 1) {
    entries.push([`stage${stage}`, { timeMs: (stage - 1) * stageMs, changeIndex: -1 }]);
  }

  return entries;
}

interface StageWindow {
  readonly stageIndex: number;
  readonly startMs: number;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
  readonly isLast: boolean;
}

interface PlaceState {
  readonly instants: Map<string, Instant>;
  readonly changeTimesMs: Map<ChangeRecord, number>;
}

function placeStage(
  stage: StageRecord,
  input: PlaceInput,
  state: PlaceState,
  window: StageWindow,
): void {
  const wordMs = 250;
  let previousInstantMs = window.windowStartMs;
  let previousLastMs: number | undefined;
  let readingEndMs = 0;

  for (const change of stage.changes) {
    const candidatesMs = [window.windowStartMs, readingEndMs, previousInstantMs + change.leadMs];

    if (previousLastMs !== undefined) {
      candidatesMs.push(previousLastMs + GRID_MS);
    }

    if (change.after !== undefined) {
      candidatesMs.push(getAfterTimeMs(change, change.after, state.instants, input.allReferences));
    }

    const atMs = Math.ceil(Math.max(...candidatesMs) / GRID_MS) * GRID_MS;
    const offsetsMs = [0, ...change.marksMs.values()];
    const lastMs = atMs + Math.max(...offsetsMs);

    if (atMs + Math.min(...offsetsMs) < window.windowStartMs || lastMs > window.windowEndMs) {
      throw new SceneError(
        'outside-window',
        `${formatChange(change)} lands outside the action window of stage ${window.stageIndex + 1} (${window.windowStartMs / 1000} s to ${window.windowEndMs / 1000} s) at ${lastMs / 1000} s; the smallest stageS that fits is ${getSmallestStageS(lastMs - window.startMs, window.isLast)} s`,
      );
    }

    const words = change.words + (input.extraWords.get(change) ?? 0);
    const changeReadingEndMs = atMs + wordMs * words + GRID_MS;

    if (changeReadingEndMs > window.startMs + input.stageMs) {
      throw new SceneError(
        'reading-too-long',
        `the reading of ${formatChange(change)} ends at ${changeReadingEndMs / 1000} s, past the end of stage ${window.stageIndex + 1} at ${(window.startMs + input.stageMs) / 1000} s`,
      );
    }

    state.changeTimesMs.set(change, atMs);

    registerInstants(state.instants, change, atMs);

    readingEndMs = Math.max(readingEndMs, changeReadingEndMs);
    previousInstantMs = atMs;
    previousLastMs = lastMs;
  }
}

function getAfterTimeMs(
  change: ChangeRecord,
  after: After,
  instants: ReadonlyMap<string, Instant>,
  allReferences: ReadonlySet<string>,
): number {
  const target = instants.get(after.change);

  if (target !== undefined) {
    return target.timeMs + after.steps * GRID_MS;
  }

  if (allReferences.has(after.change)) {
    throw new SceneError(
      'after-below',
      `${formatChange(change)} lands after "${after.change}", which sits below it`,
    );
  }

  throw new SceneError(
    'unknown-reference',
    `${formatChange(change)} names "${after.change}" in after, which matches no change, mark or built-in instant`,
  );
}

// The smallest stageS, in seconds and a multiple of half a second, that holds an instant at
// `relativeMs` after its stage starts.
function getSmallestStageS(relativeMs: number, isLast: boolean): number {
  const neededMs = relativeMs + (isLast ? 2 * GRID_MS : GRID_MS);

  return Math.ceil(neededMs / GRID_MS) * (GRID_MS / 1000);
}

function registerInstants(
  instants: Map<string, Instant>,
  change: ChangeRecord,
  atMs: number,
): void {
  if (change.id === undefined) {
    return;
  }

  instants.set(change.id, { timeMs: atMs, changeIndex: change.index });

  for (const [name, offsetMs] of change.marksMs) {
    instants.set(`${change.id}.${name}`, { timeMs: atMs + offsetMs, changeIndex: change.index });
  }
}
