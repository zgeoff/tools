import type { BeatNode, EffectNode, StageNode, StoryElement, StoryNode } from '../types.ts';
import { SceneError } from '../utils/scene-error.ts';
import { flattenStoryNode } from './flatten-story-node.ts';
import type { AttachedRecord, ChangeRecord, CollectedStages, StageRecord } from './types.ts';

interface CollectState {
  readonly stages: StageRecord[];
  readonly changes: ChangeRecord[];
  readonly attached: AttachedRecord[];
}

// The first pass: reads every stage's children in JSX order, calls each part's need, and sorts
// the parts into changes and parts that join a change with `at`.
export function collectChanges(root: StoryNode): CollectedStages {
  const state: CollectState = { stages: [], changes: [], attached: [] };

  walkOutsideStage(root, state);

  return state;
}

function walkOutsideStage(node: StoryNode, state: CollectState): void {
  for (const element of flattenStoryNode(node)) {
    if (element.node === 'stage') {
      collectStage(element, state);
    } else if (element.node === 'effect') {
      throw new SceneError('effect-outside-stage', `${element.label} sits outside every <Stage>`);
    } else if (element.node === 'beat') {
      throw new SceneError('effect-outside-stage', '<Beat> sits outside every <Stage>');
    } else if (element.node === 'element' || element.node === 'def') {
      walkOutsideStage(element.children, state);
    }
  }
}

function collectStage(stage: StageNode, state: CollectState): void {
  const stageIndex = state.stages.length;
  const stageChanges: ChangeRecord[] = [];

  for (const child of flattenStoryNode(stage.children)) {
    const parts = pickParts(child, stageIndex);
    const timing = child.node === 'beat' ? child.timing : pickEffectTiming(child);

    if (timing.at === undefined) {
      const change = buildChange(child, parts, {
        index: state.changes.length,
        stageIndex,
        position: stageChanges.length + 1,
      });

      stageChanges.push(change);
      state.changes.push(change);
    } else {
      state.attached.push({
        parts,
        at: timing.at,
        changesBefore: state.changes.length,
        label: describeChild(child, parts),
      });
    }
  }

  state.stages.push({ caption: stage.caption, tokens: stage.tokens, changes: stageChanges });
}

function pickParts(child: StoryElement, stageIndex: number): EffectNode[] {
  if (child.node === 'effect') {
    return [child];
  }

  if (child.node === 'beat') {
    return pickBeatParts(child);
  }

  if (child.node === 'stage') {
    throw new SceneError('nested-stage', `a <Stage> sits inside stage ${stageIndex + 1}`);
  }

  throw new SceneError(
    'not-a-part',
    `stage ${stageIndex + 1} holds <${child.node}>, and each child of a stage is a part or a <Beat>`,
  );
}

function pickBeatParts(beat: BeatNode): EffectNode[] {
  const parts: EffectNode[] = [];

  for (const child of flattenStoryNode(beat.children)) {
    if (child.node !== 'effect') {
      throw new SceneError('not-a-part', `<Beat> holds <${child.node}>, and it holds only parts`);
    }

    if (
      child.timing.id !== undefined ||
      child.timing.after !== undefined ||
      child.timing.at !== undefined
    ) {
      throw new SceneError(
        'not-a-part',
        `${child.label} inside <Beat> takes no id, after or at, because the Beat is the change`,
      );
    }

    parts.push(child);
  }

  return parts;
}

function pickEffectTiming(child: StoryElement): EffectNode['timing'] {
  return child.node === 'effect' ? child.timing : {};
}

interface ChangePosition {
  readonly index: number;
  readonly stageIndex: number;
  readonly position: number;
}

function buildChange(
  child: StoryElement,
  parts: readonly EffectNode[],
  where: ChangePosition,
): ChangeRecord {
  const timing = child.node === 'beat' ? child.timing : pickEffectTiming(child);
  const label = describeChild(child, parts);

  const marksMs = new Map<string, number>();

  let words = 0;
  let leadMs = 0;

  for (const part of parts) {
    const need = part.getNeed();

    words += need.words ?? 0;
    leadMs = Math.max(leadMs, Math.round((need.lead ?? 0) * 1000));

    for (const [name, seconds] of Object.entries(need.marks ?? {})) {
      if (marksMs.has(name)) {
        throw new SceneError(
          'duplicate-mark',
          `${timing.id === undefined ? `stage ${where.stageIndex + 1}, change ${where.position} ${label}` : `change "${timing.id}"`} has two marks named "${name}"`,
        );
      }

      marksMs.set(name, Math.round(seconds * 1000));
    }
  }

  return {
    ...where,
    id: timing.id,
    after: timing.after,
    parts,
    focus: child.node === 'beat' ? child.focus : undefined,
    label,
    leadMs,
    marksMs,
    words,
  };
}

function describeChild(child: StoryElement, parts: readonly EffectNode[]): string {
  if (child.node === 'effect') {
    return child.label;
  }

  return `<Beat> ${parts.map((part) => part.label).join(' + ')}`;
}
