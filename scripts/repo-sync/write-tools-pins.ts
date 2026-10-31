import { join } from 'node:path';
import type { FileSystem } from '../ci/file-system.ts';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { CommandResult } from '../ci/run-command.ts';
import { buildToolsPin } from './build-tools-pin.ts';
import type { SyncedEntry } from './plan-retired-file-removal.ts';
import type { SyncCommandContext } from './write-sync-auto-merge.ts';

export interface ToolsPinContext extends SyncCommandContext {
  readonly fileSystem: Pick<FileSystem, 'readText' | 'writeText'>;
}

// Moves every call to a zgeoff/tools workflow in the caller's tracked workflows to the commit, in a
// commit of its own, and returns the paths it changed.
export async function writeToolsPins(context: ToolsPinContext, commit: string): Promise<string[]> {
  const listed = await runChecked(context, [
    'git',
    'ls-files',
    '-z',
    '--',
    '.github/workflows/*.yml',
    '.github/workflows/*.yaml',
  ]);

  const pinned: string[] = [];

  for (const target of listed.stdout.split('\0').filter((path) => path !== '')) {
    const path = join(context.cwd, target);

    const text = await context.fileSystem.readText(path);

    const pinnedText = buildToolsPin(text, commit);

    if (pinnedText !== text) {
      await context.fileSystem.writeText(path, pinnedText);

      pinned.push(target);
    }
  }

  if (pinned.length > 0) {
    await runChecked(context, ['git', 'add', '--', ...pinned]);

    await runChecked(context, [
      'git',
      'commit',
      '-q',
      '-m',
      `chore: pin the zgeoff/tools workflows to ${commit.slice(0, 12)}`,
      '-m',
      `Each call to a zgeoff/tools workflow pins ${commit}, the commit this sync copies.`,
    ]);
  }

  return pinned;
}

// The entry a sync pull request names when it only moves the pins.
export const toolsPinsEntry: SyncedEntry = {
  name: 'tools-pins',
  description:
    'The calls to zgeoff/tools workflows, whose pinned commit changed a workflow or a step script',
};

function runChecked(context: SyncCommandContext, argv: readonly string[]): Promise<CommandResult> {
  return runCheckedCommand(context.runCommand, argv, { cwd: context.cwd, env: context.env });
}
