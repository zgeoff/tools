import { mock } from 'bun:test';
import type { ProcessGroups } from '../packages/rig/src/browser/process-groups.ts';

// Process groups that every signal leaves running, so a stop never sees the group exit. The
// signal stand-in records each signal it gets.
export function buildStuckProcessGroups() {
  return {
    probeGroup: mock<ProcessGroups['probeGroup']>(() => true),
    signalGroup: mock<ProcessGroups['signalGroup']>(() => {}),
  } satisfies ProcessGroups;
}
