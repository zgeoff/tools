import { join } from 'node:path';
import type { CheckName } from './check-names.ts';
import { runDependencyGatesCommand } from './dependency-gates/run-dependency-gates-check.ts';
import { runCommitsCommand } from './run-commits-check.ts';
import { runLocalPathsCommand } from './run-local-paths-check.ts';
import { runTestTimeoutsCommand } from './run-test-timeouts-check.ts';
import { runUncommittedCommand } from './run-uncommitted-check.ts';
import { runWorkflowsCommand } from './run-workflows-check.ts';

export interface CheckRunnerDeps {
  // The folder that holds the docs checks' shell scripts.
  readonly docsFolder: string;

  // Runs a command with this process's output streams, and returns its exit code.
  readonly runScript: (argv: readonly string[]) => Promise<number>;
}

type CheckRunner = (args: readonly string[]) => Promise<number> | number;

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
    commits: runCommitsCommand,
    'local-paths': runLocalPathsCommand,
    'test-timeouts': runTestTimeoutsCommand,
    workflows: runWorkflowsCommand,
    'dependency-gates': runDependencyGatesCommand,
    uncommitted: runUncommittedCommand,
  };

  return (name, args) => Promise.resolve(runners[name](args));
}
