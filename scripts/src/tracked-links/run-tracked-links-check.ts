import { match } from 'ts-pattern';
import { writeStdout } from '../../../packages/std/src/write-stdout.ts';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import type { DanglingLink, TrackedLink } from './collect-dangling-links.ts';
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

// git's stage number for a path with no merge conflict; a conflicted path has a stage per side.
const mergedStage = '0';

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

  const mergedLinks = entries.filter(
    (candidate) => candidate.mode === linkMode && candidate.stage === mergedStage,
  );

  for (const entry of mergedLinks) {
    const blob = await runCheckedCommand(
      options.runCommand,
      ['git', 'cat-file', 'blob', entry.objectID],
      commandOptions,
    );

    links.push({ path: entry.path, target: blob.stdout });
  }

  const dangling = collectDanglingLinks(links, [...new Set(entries.map((entry) => entry.path))]);

  for (const link of dangling) {
    options.writeOutput(`tracked-links: ${formatDanglingLink(link)}\n`);
  }

  return dangling.length === 0 ? 0 : 1;
}

interface IndexEntry {
  readonly mode: string;
  readonly objectID: string;
  readonly stage: string;
  readonly path: string;
}

// Each NUL-ended record of `git ls-files --stage -z` reads `<mode> <object> <stage>\t<path>`.
function parseIndexEntries(text: string): IndexEntry[] {
  return text
    .split('\0')
    .filter((record) => record !== '')
    .map((record) => {
      const tab = record.indexOf('\t');
      const [mode = '', objectID = '', stage = ''] = record.slice(0, tab).split(' ');

      return { mode, objectID, stage, path: record.slice(tab + 1) };
    });
}

function formatDanglingLink(link: DanglingLink): string {
  return match(link.cause)
    .with(
      { kind: 'missing' },
      (cause) =>
        `${link.path} links to ${cause.path}, which a fresh clone lacks; track it, or a file in it such as ${cause.path}/.gitkeep`,
    )
    .with(
      { kind: 'not-a-folder' },
      (cause) =>
        `${link.path} links through ${cause.path}, a tracked file where its target needs a folder`,
    )
    .with(
      { kind: 'outside-repo' },
      () => `${link.path} links to ${link.target}, which leads outside the repo`,
    )
    .with(
      { kind: 'loop' },
      () => `${link.path} reaches its target through more than 40 links, which Linux refuses`,
    )
    .exhaustive();
}

if (import.meta.main) {
  process.exitCode = await runTrackedLinksCheck({
    cwd: process.cwd(),
    env: process.env,
    runCommand,
    writeOutput: writeStdout,
  });
}
