import { buildSyncRowSplit } from './build-sync-row-split.ts';
import { isWorkflowPath } from './is-workflow-path.ts';

export interface SyncFileRow {
  readonly action: 'copy' | 'skip';

  // The source's path in the caller's checkout.
  readonly source: string;
  readonly target: string;
  readonly mode: string;
}

// The text of a workflow target the caller already holds, and of the source that would replace it.
export interface ExistingWorkflow {
  readonly targetText: string;
  readonly sourceText: string;
}

export interface CopyPlanFacts {
  readonly rows: readonly SyncFileRow[];

  // Keyed by target path; a target that is no workflow, or that does not exist, has no entry.
  readonly existingWorkflows: ReadonlyMap<string, ExistingWorkflow>;

  // The line that marks a workflow file repo-sync wrote.
  readonly marker: string;
}

export interface PlannedCopy {
  readonly source: string;
  readonly target: string;
  readonly mode: string;

  // A workflow target's calls of tools workflows move to the commit the run syncs from.
  readonly isPinned: boolean;
}

export interface CopyPlan {
  readonly copies: readonly PlannedCopy[];

  // The workflow targets the repo wrote itself, which the entry may not overwrite.
  readonly conflicts: readonly string[];

  // The targets the caller does not receive, whose blocks the copied Markdown files lose.
  readonly excluded: readonly string[];

  readonly strippedTargets: readonly string[];
}

export function buildCopyPlan(facts: Readonly<CopyPlanFacts>): CopyPlan {
  const split = buildSyncRowSplit(facts.rows);
  const excluded = split.excluded.map((row) => row.target);
  const taken = split.taken;

  const conflicts = taken
    .filter((row) => isOwnWorkflow(facts.existingWorkflows.get(row.target), facts.marker))
    .map((row) => row.target);

  const copies = taken
    .filter((row) => !conflicts.includes(row.target))
    .map((row) => ({
      source: row.source,
      target: row.target,
      mode: row.mode,
      isPinned: isWorkflowPath(row.target),
    }));

  const strippedTargets =
    excluded.length === 0
      ? []
      : copies.filter((copy) => copy.target.endsWith('.md')).map((copy) => copy.target);

  return { copies, conflicts, excluded, strippedTargets };
}

const sharedCallPattern = /zgeoff\/tools\/\.github\/workflows\/[^@\s]+/gu;

// Overwriting a workflow the repo wrote itself would drop its own jobs in a pull request that reads
// as a routine sync. The marker line shows a file repo-sync wrote, and a file that calls the same
// shared workflow as the source is a copy the repo pinned by hand.
function isOwnWorkflow(existing: ExistingWorkflow | undefined, marker: string): boolean {
  if (existing === undefined || existing.targetText.includes(marker)) {
    return false;
  }

  const calls = new Set(existing.sourceText.match(sharedCallPattern));

  return ![...calls].some((call) => existing.targetText.includes(call));
}
