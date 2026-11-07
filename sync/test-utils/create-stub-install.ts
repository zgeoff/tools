import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { match } from 'ts-pattern';

export type StubInstallOutcome =
  | { readonly kind: 'fails' }
  | { readonly kind: 'killed' }
  | { readonly kind: 'removes'; readonly path: string }
  | { readonly kind: 'links'; readonly packageName: string; readonly packageDir: string };

export interface StubInstallOptions {
  readonly log: string;
  readonly outcome: StubInstallOutcome;

  // The install waits until this path exists, so a test can act while the install runs.
  readonly releasePath?: string;
}

// Writes a stand-in `bun` that appends `bun <arguments> in <folder>` to the log, prints
// `stub install started` on stderr, then fails, kills itself with SIGKILL, removes a path and fails,
// or links the package into node_modules.
export async function createStubInstall(
  directory: string,
  options: StubInstallOptions,
): Promise<void> {
  const path = join(directory, 'bun');

  const waitSteps =
    options.releasePath === undefined
      ? []
      : [`while [ ! -e '${options.releasePath}' ]; do sleep 0.05; done`];

  const outcomeSteps = match(options.outcome)
    .with({ kind: 'fails' }, () => ['exit 1'])
    .with({ kind: 'killed' }, () => ['kill -KILL $$'])
    .with({ kind: 'removes' }, (outcome) => [`rm -f '${outcome.path}'`, 'exit 1'])
    .with({ kind: 'links' }, (outcome) => [
      `mkdir -p "node_modules/$(dirname '${outcome.packageName}')"`,
      `ln -s '${outcome.packageDir}' 'node_modules/${outcome.packageName}'`,
    ])
    .exhaustive();

  await writeFile(
    path,
    [
      '#!/bin/sh',
      `echo "bun $* in $PWD" >> '${options.log}'`,
      'echo "stub install started" >&2',
      ...waitSteps,
      ...outcomeSteps,
      '',
    ].join('\n'),
  );

  await chmod(path, 0o755);
}
