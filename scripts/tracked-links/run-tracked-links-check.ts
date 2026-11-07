import { writeStdout } from '../../packages/std/src/write-stdout.ts';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import type { TrackedLink } from './collect-dangling-links.ts';
import { collectDanglingLinks } from './collect-dangling-links.ts';

export interface TrackedLinksCheckOptions {
  // The root of a git checkout.
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly runCommand: RunCommand;
  readonly writeOutput: (text: string) => void;
}

// git's file mode for a symbolic link.
const linkMode = '120000';

// Reads the index, not the working tree: a target that only an install makes is on disk here but
// missing from a clone.
export async function runTrackedLinksCheck(
  options: Readonly<TrackedLinksCheckOptions>,
): Promise<number> {
  const commandOptions = { cwd: options.cwd, env: options.env };

  const listing = await runCheckedCommand(
    options.runCommand,
    ['git', 'ls-files', '--stage', '-z'],
    commandOptions,
  );

  const entries = parseIndexEntries(listing.stdout);
  const links: TrackedLink[] = [];

  for (const entry of entries.filter((candidate) => candidate.mode === linkMode)) {
    const blob = await runCheckedCommand(
      options.runCommand,
      ['git', 'cat-file', 'blob', entry.objectID],
      commandOptions,
    );

    links.push({ path: entry.path, target: blob.stdout });
  }

  const dangling = collectDanglingLinks(
    links,
    entries.map((entry) => entry.path),
  );

  for (const link of dangling) {
    options.writeOutput(
      `tracked-links: ${link.path} links to ${link.resolved}, which a fresh clone lacks; track it, or a file in it such as ${link.resolved}/.gitkeep\n`,
    );
  }

  return dangling.length === 0 ? 0 : 1;
}

interface IndexEntry {
  readonly mode: string;
  readonly objectID: string;
  readonly path: string;
}

// Each NUL-ended record of `git ls-files --stage -z` reads `<mode> <object> <stage>\t<path>`.
function parseIndexEntries(text: string): IndexEntry[] {
  return text
    .split('\0')
    .filter((record) => record !== '')
    .map((record) => {
      const tab = record.indexOf('\t');
      const [mode = '', objectID = ''] = record.slice(0, tab).split(' ');

      return { mode, objectID, path: record.slice(tab + 1) };
    });
}

if (import.meta.main) {
  process.exitCode = await runTrackedLinksCheck({
    cwd: process.cwd(),
    env: process.env,
    runCommand,
    writeOutput: writeStdout,
  });
}
