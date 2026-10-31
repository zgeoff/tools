import type { LaneParallelism } from './types.ts';

export interface StandardLane {
  readonly name: string;

  readonly suffix: string | null;

  readonly limitMs: number;

  readonly parallel: LaneParallelism;
}

// The limits are the per-test timeouts of the Lanes table in the testing skill. Every lane but
// unit runs one process per file, because it needs a real system that two files cannot share.
export const standardLanes: readonly StandardLane[] = [
  { name: 'unit', suffix: null, limitMs: 5000, parallel: 'workers' },
  { name: 'e2e', suffix: null, limitMs: 15_000, parallel: 1 },
  { name: 'browser', suffix: '.browser', limitMs: 10_000, parallel: 1 },
  { name: 'docker', suffix: '.docker', limitMs: 15_000, parallel: 1 },
  { name: 'host', suffix: '.host', limitMs: 15_000, parallel: 1 },
  { name: 'agent-sdk', suffix: '.agent-sdk', limitMs: 5000, parallel: 1 },
  { name: 'model-api', suffix: '.model-api', limitMs: 120_000, parallel: 1 },
];
