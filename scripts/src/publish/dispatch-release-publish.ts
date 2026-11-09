import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { parseReleaseOutputs } from '../release/parse-release-outputs.ts';

export interface ReleasePublishDispatchOptions {
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly repository: string;

  readonly releaseOutputsText: string;

  readonly runCommand: RunCommand;

  readonly writeError: (text: string) => void;
}

// npm provenance names the run's own commit as the source, so the release publishes from a run
// whose commit is the tagged one: a dispatch at the release tag.
export async function dispatchReleasePublish(
  options: ReleasePublishDispatchOptions,
): Promise<number> {
  const dispatch = buildPublishDispatch(options.releaseOutputsText);

  if (dispatch.kind === 'invalid') {
    options.writeError(`::error::${dispatch.message}\n`);

    return 1;
  }

  await runCheckedCommand(
    options.runCommand,
    [
      'gh',
      'workflow',
      'run',
      'main.yml',
      '--repo',
      options.repository,
      '--ref',
      dispatch.tag,
      '-f',
      `republish_paths=${JSON.stringify(dispatch.paths)}`,
      '-f',
      `released_versions=${JSON.stringify(dispatch.versions)}`,
    ],
    { cwd: options.cwd, env: options.env },
  );

  return 0;
}

type PublishDispatch =
  | {
      readonly kind: 'dispatch';
      readonly tag: string;
      readonly paths: readonly string[];
      readonly versions: Readonly<Record<string, string>>;
    }
  | { readonly kind: 'invalid'; readonly message: string };

function buildPublishDispatch(releaseOutputsText: string): PublishDispatch {
  const parsed = parseReleaseOutputs(releaseOutputsText);

  if (parsed.kind === 'invalid') {
    return parsed;
  }

  const outputs = parsed.outputs;
  const paths = parsed.paths;
  const shas = [...new Set(paths.map((path) => outputs[`${path}--sha`] ?? 'null'))];
  const [firstPath] = paths;
  const tag = firstPath === undefined ? undefined : outputs[`${firstPath}--tag_name`];

  if (shas.length !== 1 || shas[0] === 'null') {
    return { kind: 'invalid', message: `expected one release commit, got: ${shas.join(' ')}` };
  }

  if (tag === undefined) {
    return { kind: 'invalid', message: `the release outputs hold no tag for ${firstPath}` };
  }

  const versions = Object.fromEntries(
    paths.flatMap((path): [string, string][] => {
      const version = outputs[`${path}--version`];

      return version === undefined ? [] : [[path, version]];
    }),
  );

  return { kind: 'dispatch', tag, paths, versions };
}

if (import.meta.main) {
  process.exitCode = await dispatchReleasePublish({
    cwd: process.cwd(),
    env: process.env,
    repository: process.env['GITHUB_REPOSITORY'] ?? '',
    releaseOutputsText: process.env['RELEASE_OUTPUTS'] ?? '',
    runCommand,
    writeError: (text) => {
      process.stderr.write(text);
    },
  });
}
