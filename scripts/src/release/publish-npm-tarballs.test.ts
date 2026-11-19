import { expect, onTestFinished, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRunFolderPrefix } from '@zgeoff/testing/helpers';
import { runBashScript } from '../test-utils/run-bash-script.ts';

interface MockPackage {
  readonly folder: string;
  readonly name: string;
  readonly version: string;
  readonly private?: boolean;

  // The version npm already holds; unset: npm holds none.
  readonly published?: string;

  // A name whose npm publish fails.
  readonly failsToPublish?: boolean;
}

async function setupTest(packages: readonly MockPackage[], pathsInput?: string) {
  // The stand-in npm answers `view` from the published map and fails `publish` for a failing name;
  // the stand-in bun lists its calls and writes an empty tarball for `pm pack`.
  const npmStub = `#!/usr/bin/env bash
dir=$(dirname "$0")
echo "npm $*" >> "$dir/calls.log"
case "$1" in
  view) grep -F "$2=" "$dir/published" | cut -d= -f2 ;;
  publish) ! grep -qxF "$(basename "$PWD")" "$dir/failing" ;;
esac
`;

  const bunStub = `#!/usr/bin/env bash
dir=$(dirname "$0")
echo "bun $PWD $*" >> "$dir/calls.log"
if [ "$1 $2" = "pm pack" ]; then
  touch "$4/pkg.tgz"
fi
`;

  const directory = await mkdtemp(
    join(import.meta.dir, readRunFolderPrefix('.test-publish-npm-tarballs-')),
  );

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const stubs = join(directory, 'stubs');
  const root = join(directory, 'repo');

  await mkdir(stubs);
  await writeFile(join(stubs, 'npm'), npmStub);
  await writeFile(join(stubs, 'bun'), bunStub);
  await chmod(join(stubs, 'npm'), 0o755);
  await chmod(join(stubs, 'bun'), 0o755);
  await writeFile(join(stubs, 'calls.log'), '');

  await writeFile(
    join(stubs, 'published'),
    packages
      .filter((pkg) => pkg.published !== undefined)
      .map((pkg) => `${pkg.name}@${pkg.version}=${pkg.published}\n`)
      .join(''),
  );

  await writeFile(
    join(stubs, 'failing'),
    packages
      .filter((pkg) => pkg.failsToPublish)
      .map((pkg) => `${pkg.folder.split('/').pop()}\n`)
      .join(''),
  );

  for (const pkg of packages) {
    await mkdir(join(root, pkg.folder), { recursive: true });

    await writeFile(
      join(root, pkg.folder, 'package.json'),
      JSON.stringify({
        name: pkg.name,
        version: pkg.version,
        private: pkg.private,
      }),
    );
  }

  const run = () =>
    runBashScript({
      script: fileURLToPath(new URL('publish-npm-tarballs.sh', import.meta.url)),
      args: [],
      stubDirectory: stubs,
      env: {
        PATHS: pathsInput ?? JSON.stringify(packages.map((pkg) => pkg.folder)),
        TMPDIR: directory,
      },
      cwd: root,
    });

  const readCalls = async () => {
    const log = await readFile(join(stubs, 'calls.log'), 'utf8');

    return log
      .split('\n')
      .filter(Boolean)
      .map((call) => call.replaceAll(directory, '<dir>'));
  };

  return { run, readCalls };
}

test('it packs a package and publishes its tarball with provenance', async () => {
  const ctx = await setupTest([{ folder: 'packages/std', name: '@zgeoff/std', version: '1.2.0' }]);
  const result = await ctx.run();
  const calls = await ctx.readCalls();

  expect(result.exitCode).toBe(0);
  expect(calls).toHaveLength(4);
  expect(calls[0]).toBe('npm view @zgeoff/std@1.2.0 version');
  expect(calls[1]).toBe('bun <dir>/repo/packages/std run --if-present build');
  expect(calls[2]).toMatch(/^bun <dir>\/repo\/packages\/std pm pack --destination \S+$/u);
  expect(calls[3]).toMatch(/^npm publish \S+\/pkg\.tgz --provenance --access public$/u);
});

test('it skips a private package and a version npm holds already', async () => {
  const ctx = await setupTest([
    {
      folder: 'packages/hidden',
      name: '@zgeoff/hidden',
      version: '0.1.0',
      private: true,
    },
    {
      folder: 'packages/std',
      name: '@zgeoff/std',
      version: '1.2.0',
      published: '1.2.0',
    },
  ]);

  const result = await ctx.run();

  expect(result).toStrictEqual({
    exitCode: 0,
    stdout: 'skipping @zgeoff/hidden: private\nskipping @zgeoff/std@1.2.0: already published\n',
    stderr: '',
  });

  const calls = await ctx.readCalls();

  expect(calls).toStrictEqual(['npm view @zgeoff/std@1.2.0 version']);
});

test('it publishes the rest after one package fails, then fails', async () => {
  const ctx = await setupTest([
    {
      folder: 'packages/bad',
      name: '@zgeoff/bad',
      version: '1.0.0',
      failsToPublish: true,
    },
    { folder: 'packages/good', name: '@zgeoff/good', version: '2.0.0' },
  ]);

  const result = await ctx.run();
  const calls = await ctx.readCalls();

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe('::error::@zgeoff/bad@1.0.0 failed to publish\n');
  expect(calls.filter((call) => call.startsWith('npm publish'))).toHaveLength(2);
});

test('it fails and publishes nothing when the paths are not JSON', async () => {
  const ctx = await setupTest(
    [{ folder: 'packages/std', name: '@zgeoff/std', version: '1.2.0' }],
    'not-json',
  );

  const result = await ctx.run();
  const calls = await ctx.readCalls();

  expect(result.exitCode).not.toBe(0);
  expect(calls).toStrictEqual([]);
});
