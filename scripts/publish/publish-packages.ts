import { join } from 'node:path';
import type { FileSystem } from '../ci/file-system.ts';
import { makeLoggedCommandRunner } from '../ci/make-logged-command-runner.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { parseTextList } from '../release/parse-text-list.ts';
import { parseTextRecord } from '../release/parse-text-record.ts';

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

  const packages = await Promise.all(
    paths.map((path) =>
      readPackage(options.fileSystem, join(options.cwd, path), releasedVersions[path]),
    ),
  );

  // A tag whose version the checkout does not hold fails the run before anything publishes, which
  // the already-published skip would otherwise hide.
  const mismatches = packages.filter(
    (entry) => entry.releasedVersion !== undefined && entry.releasedVersion !== entry.version,
  );

  if (mismatches.length > 0) {
    for (const entry of mismatches) {
      options.writeError(
        `::error::${entry.name}: the release tagged ${entry.releasedVersion ?? ''} but ${join(entry.folder, 'package.json')} holds ${entry.version}\n`,
      );
    }

    return 1;
  }

  for (const entry of packages) {
    await publishPackage(entry, options);
  }

  return 0;
}

interface ReleasedPackage {
  readonly folder: string;
  readonly name: string;
  readonly version: string;
  readonly isPrivate: boolean;
  readonly hasBuild: boolean;
  readonly releasedVersion: string | undefined;
}

async function readPackage(
  fileSystem: Pick<FileSystem, 'readDirectory' | 'readText'>,
  folder: string,
  releasedVersion: string | undefined,
): Promise<ReleasedPackage> {
  const text = await fileSystem.readText(join(folder, 'package.json'));

  const manifest: unknown = JSON.parse(text);

  if (typeof manifest !== 'object' || manifest === null) {
    throw new Error(`${folder}/package.json holds no JSON object`);
  }

  const name = 'name' in manifest ? manifest.name : undefined;
  const version = 'version' in manifest ? manifest.version : undefined;

  if (typeof name !== 'string' || typeof version !== 'string') {
    throw new TypeError(`${folder}/package.json names no package and version`);
  }

  const scripts = 'scripts' in manifest ? manifest.scripts : undefined;

  return {
    folder,
    name,
    version,
    isPrivate: 'private' in manifest && manifest.private === true,
    hasBuild: typeof scripts === 'object' && scripts !== null && 'build' in scripts,
    releasedVersion,
  };
}

// The registry check makes a rerun after a partial publish skip the packages already on npm.
async function publishPackage(
  entry: ReleasedPackage,
  options: PackagesPublishOptions,
): Promise<void> {
  const commandOptions = { cwd: entry.folder, env: options.env };

  const run = (argv: readonly string[]) =>
    runCheckedCommand(options.runLoggedCommand, argv, commandOptions);

  if (entry.isPrivate) {
    options.writeOutput(`skipping ${entry.name}: private\n`);

    return;
  }

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
