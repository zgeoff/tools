import { join } from 'node:path';
import type { CheckName } from './check-names.ts';

export type CheckRunner = (args: readonly string[]) => Promise<number> | number;

type DocsCheckName = 'prose' | 'length' | 'links' | 'readmes' | 'vision' | 'skill';

export type RepoCheckName = Exclude<CheckName, DocsCheckName>;

export interface CheckRunnerDeps {
  // The folder that holds the docs checks' shell scripts.
  readonly docsFolder: string;

  // Runs a command with this process's output streams, and returns its exit code.
  readonly runScript: (argv: readonly string[]) => Promise<number>;

  readonly repoChecks: Readonly<Record<RepoCheckName, CheckRunner>>;
}

export function makeCheckRunner(
  deps: CheckRunnerDeps,
): (name: CheckName, args: readonly string[]) => Promise<number> {
  const makeDocsCheckRunner =
    (script: string): CheckRunner =>
    (args) =>
      deps.runScript(['bash', join(deps.docsFolder, script), ...args]);

  // Typed over every check name, so a new check fails the type check until it has a runner.
  const runners: Readonly<Record<CheckName, CheckRunner>> = {
    prose: makeDocsCheckRunner('check-prose.sh'),
    length: makeDocsCheckRunner('check-length.sh'),
    links: makeDocsCheckRunner('check-links.sh'),
    readmes: makeDocsCheckRunner('check-readmes.sh'),
    vision: makeDocsCheckRunner('check-vision.sh'),
    skill: makeDocsCheckRunner('check-skill.sh'),
    ...deps.repoChecks,
  };

  return (name, args) => Promise.resolve(runners[name](args));
}
