import { dirname, join } from 'node:path';
import type { FileSystem } from '../ci/file-system.ts';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { CommandResult } from '../ci/run-command.ts';
import type { CopyPlan } from './build-copy-plan.ts';
import { buildToolsPin } from './build-tools-pin.ts';
import type { SyncCommandContext } from './write-sync-auto-merge.ts';

export interface CopyPlanContext extends SyncCommandContext {
  readonly fileSystem: Pick<FileSystem, 'createDirectory' | 'probePath' | 'readText' | 'writeText'>;

  // The commit of zgeoff/tools that each copied workflow's calls pin.
  readonly commit: string;
}

export async function writeCopyPlan(context: CopyPlanContext, plan: CopyPlan): Promise<void> {
  for (const copy of plan.copies) {
    const path = join(context.cwd, copy.target);
    const existing = copy.isPinned ? await readExistingText(context, path) : null;

    await context.fileSystem.createDirectory(join(context.cwd, dirname(copy.target)));

    await runChecked(context, [
      'install',
      '-m',
      copy.mode,
      `.repo-sync/${copy.source}`,
      copy.target,
    ]);

    if (copy.isPinned) {
      const text = await context.fileSystem.readText(path);

      const pinned = buildToolsPin(text, context.commit);

      // A copy that differs only by its pin keeps the repo's text, so a commit that changes no
      // synced file opens no pull request; the pin moves with the next one that does.
      const isPinOnly = existing !== null && buildToolsPin(existing, context.commit) === pinned;
      const written = isPinOnly ? existing : pinned;

      await context.fileSystem.writeText(path, written);
    }
  }

  for (const target of plan.strippedTargets) {
    await runChecked(context, [
      'bash',
      '.repo-sync/scripts/remove-excluded-blocks.sh',
      target,
      ...plan.excluded,
    ]);
  }
}

async function readExistingText(context: CopyPlanContext, path: string): Promise<string | null> {
  const exists = await context.fileSystem.probePath(path);

  return exists ? context.fileSystem.readText(path) : null;
}

function runChecked(context: CopyPlanContext, argv: readonly string[]): Promise<CommandResult> {
  return runCheckedCommand(context.runCommand, argv, { cwd: context.cwd, env: context.env });
}
