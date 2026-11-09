import { join } from 'node:path';
import type { FileSystem } from '../ci/file-system.ts';
import { makeLoggedCommandRunner } from '../ci/make-logged-command-runner.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { parseTextList } from '../release/parse-text-list.ts';
import { parseTextRecord } from '../release/parse-text-record.ts';
import type { PackageManifest } from './parse-package-manifest.ts';
import { parsePackageManifest } from './parse-package-manifest.ts';

export interface PackagesPublishOptions {
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly pathsText: string;

  readonly releasedVersionsText: string;

  readonly fileSystem: Pick<FileSystem, 'readDirectory' | 'readText'>;

  // Runs the registry check, whose answer the publish reads.
  readonly runCommand: RunCommand;

  // Runs the build, pack and publish, whose output the log shows as each command writes it.
  readonly runLoggedCommand: RunCommand;

  readonly writeOutput: (text: string) => void;

  readonly writeError: (text: string) => void;
}

// npm publishes, not bun: trusted publishing (OIDC) needs npm 11.5.1 or newer, and bun publish has
// no OIDC support (oven-sh/bun#15601). bun packs, because it turns catalog: and workspace:
// versions into exact ones, which npm pack ships unchanged.
export async function publishPackages(options: PackagesPublishOptions): Promise<number> {
  const pathsText = options.pathsText === '' ? '[]' : options.pathsText;
  const versionsText = options.releasedVersionsText === '' ? '{}' : options.releasedVersionsText;
  const paths = parseTextList(pathsText);
  const releasedVersions = parseTextRecord(versionsText);

  if (paths === null || releasedVersions === null) {
    options.writeError(
      '::error::PATHS_RELEASED holds no JSON array of paths, or RELEASED_VERSIONS no JSON object of versions\n',
    );

    return 1;
  }

  const manifests = await Promise.all(
    paths.map(async (path) => {
      const folder = join(options.cwd, path);

      const text = await options.fileSystem.readText(join(folder, 'package.json'));

      return parsePackageManifest(text, folder, releasedVersions[path]);
    }),
  );

  // A tag whose version the checkout does not hold fails the run before anything publishes, which
  // the already-published skip would otherwise hide.
  const mismatches = manifests.flatMap((manifest) => collectVersionMismatches(manifest));

  if (mismatches.length > 0) {
    for (const mismatch of mismatches) {
      options.writeError(`::error::${mismatch}\n`);
    }

    return 1;
  }

  for (const manifest of manifests) {
    await publishManifest(manifest, options);
  }

  return 0;
}

type ManifestOf<Kind extends PackageManifest['kind']> = Extract<
  PackageManifest,
  { readonly kind: Kind }
>;

type VersionMismatchCollector<Kind extends PackageManifest['kind']> = (
  manifest: ManifestOf<Kind>,
) => string[];

// A private package never publishes, so the release's version check covers public ones only.
const versionMismatchCollectors: {
  readonly [Kind in PackageManifest['kind']]: VersionMismatchCollector<Kind>;
} = {
  private: () => [],
  public: (manifest) =>
    manifest.releasedVersion === undefined || manifest.releasedVersion === manifest.version
      ? []
      : [
          `${manifest.name}: the release tagged ${manifest.releasedVersion} but ${join(manifest.folder, 'package.json')} holds ${manifest.version}`,
        ],
};

function collectVersionMismatches<Kind extends PackageManifest['kind']>(
  manifest: ManifestOf<Kind>,
): string[] {
  const collectMismatches: VersionMismatchCollector<Kind> =
    versionMismatchCollectors[manifest.kind];

  return collectMismatches(manifest);
}

type ManifestPublisher<Kind extends PackageManifest['kind']> = (
  manifest: ManifestOf<Kind>,
  options: PackagesPublishOptions,
) => Promise<void>;

// A table typed over every manifest kind, so a new kind fails the type check until it has a publish.
const manifestPublishers: { readonly [Kind in PackageManifest['kind']]: ManifestPublisher<Kind> } =
  {
    private: (manifest, options) => {
      options.writeOutput(`skipping ${manifest.name}: private\n`);

      return Promise.resolve();
    },
    public: (manifest, options) => publishPackage(manifest, options),
  };

function publishManifest<Kind extends PackageManifest['kind']>(
  manifest: ManifestOf<Kind>,
  options: PackagesPublishOptions,
): Promise<void> {
  const publish: ManifestPublisher<Kind> = manifestPublishers[manifest.kind];

  return publish(manifest, options);
}

// The registry check makes a rerun after a partial publish skip the packages already on npm.
async function publishPackage(
  entry: ManifestOf<'public'>,
  options: PackagesPublishOptions,
): Promise<void> {
  const commandOptions = { cwd: entry.folder, env: options.env };

  const run = (argv: readonly string[]) =>
    runCheckedCommand(options.runLoggedCommand, argv, commandOptions);

  const published = await options.runCommand(
    ['npm', 'view', `${entry.name}@${entry.version}`, 'version'],
    commandOptions,
  );

  if (published.stdout.trim() === entry.version) {
    options.writeOutput(`skipping ${entry.name}@${entry.version}: already published\n`);

    return;
  }

  if (entry.hasBuild) {
    await run(['bun', 'run', 'build']);
  }

  await run(['bun', 'pm', 'pack']);

  const files = await options.fileSystem.readDirectory(entry.folder);

  const tarballs = files.filter((file) => file.endsWith('.tgz'));
  const [tarball] = tarballs;

  if (tarballs.length !== 1 || tarball === undefined) {
    throw new Error(`bun pm pack left ${tarballs.length} tarballs in ${entry.folder}`);
  }

  await run(['npm', 'publish', `./${tarball}`, '--provenance', '--access', 'public']);
}

if (import.meta.main) {
  process.exitCode = await publishPackages({
    cwd: process.cwd(),
    env: process.env,
    pathsText: process.env['PATHS_RELEASED'] ?? '',
    releasedVersionsText: process.env['RELEASED_VERSIONS'] ?? '',
    fileSystem: nodeFileSystem,
    runCommand,
    runLoggedCommand: makeLoggedCommandRunner({ stdout: process.stdout, stderr: process.stderr }),
    writeOutput: (text) => {
      process.stdout.write(text);
    },
    writeError: (text) => {
      process.stderr.write(text);
    },
  });
}
