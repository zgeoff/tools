import type {
  ActingSpan,
  After,
  EffectNode,
  HostNode,
  Placed,
  Reference,
  TokenValue,
} from '../types.ts';

export interface ChangeRecord {
  readonly index: number;
  readonly stageIndex: number;
  readonly position: number;
  readonly id: string | undefined;
  readonly after: After | undefined;
  readonly parts: readonly EffectNode[];
  readonly focus: HostNode<unknown> | undefined;
  readonly label: string;
  readonly leadMs: number;

  // Offsets from the change's instant, in milliseconds.
  readonly marksMs: ReadonlyMap<string, number>;

  // The words of the change's own parts. Attached parts add theirs when the timeline places.
  readonly words: number;
}

export interface AttachedRecord {
  readonly parts: readonly EffectNode[];
  readonly at: Reference;

  // How many changes come before the part in the tree.
  readonly changesBefore: number;
  readonly label: string;
}

export interface StageRecord {
  readonly caption: string;
  readonly tokens: Readonly<Record<string, TokenValue>>;
  readonly changes: readonly ChangeRecord[];
}

export interface CollectedStages {
  readonly stages: readonly StageRecord[];
  readonly changes: readonly ChangeRecord[];
  readonly attached: readonly AttachedRecord[];
}

export interface Timeline {
  readonly session: object;
  readonly stageS: number;
  readonly loopS: number;
  readonly resetS: number;
  readonly stages: readonly { readonly caption: string; readonly startS: number }[];
  readonly tokens: Readonly<Record<string, TokenValue>>;
  readonly placements: ReadonlyMap<EffectNode, Placed>;
  readonly acting: ReadonlyMap<HostNode<unknown>, readonly ActingSpan[]>;
  readonly writtenHosts: ReadonlySet<HostNode<unknown>>;
  readonly find: (reference: Reference) => number;
}
