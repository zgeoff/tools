import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'manifest-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const manifestPath = join(import.meta.dir, 'manifest.json');

  const build =
    await $`jq -er '.[] | select(.name == "pre-push-baseline") | .build' ${manifestPath}`.text();

  return {
    directory,
    runBuild: () => $`bash -euo pipefail -c ${build}`.cwd(directory).quiet(),
    readPackageJSON: async () => {
      const packageJSON: unknown = await Bun.file(join(directory, 'package.json')).json();

      return packageJSON;
    },
  };
}

test('it runs a pre-push-baseline build that moves a files:branch script that runs the old collect-branch-files.ts to read-branch-files.ts', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({
      scripts: {
        'files:branch': 'bun scripts/collect-branch-files.ts',
        'lint:files': 'oxlint --no-error-on-unmatched-pattern',
        'test:related': 'bun scripts/run-related-tests.ts',
      },
    }),
  );

  await ctx.runBuild();

  const packageJSON = await ctx.readPackageJSON();

  expect(packageJSON).toStrictEqual({
    scripts: {
      'files:branch': 'bun scripts/read-branch-files.ts',
      'lint:files': 'oxlint --no-error-on-unmatched-pattern',
      'test:related': 'bun scripts/run-related-tests.ts',
    },
  });
});

test('it runs a pre-push-baseline build that keeps a files:branch script the repo wrote itself', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({
      scripts: {
        'files:branch': 'git diff --name-only origin/main',
        'lint:files': 'oxlint',
        'test:related': 'bun test',
      },
    }),
  );

  await ctx.runBuild();

  const packageJSON = await ctx.readPackageJSON();

  expect(packageJSON).toStrictEqual({
    scripts: {
      'files:branch': 'git diff --name-only origin/main',
      'lint:files': 'oxlint',
      'test:related': 'bun test',
    },
  });
});

test('it runs a pre-push-baseline build that adds the package scripts a repo lacks, with files:branch running read-branch-files.ts', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { test: 'bun test' } }),
  );

  await ctx.runBuild();

  const packageJSON = await ctx.readPackageJSON();

  expect(packageJSON).toStrictEqual({
    scripts: {
      test: 'bun test',
      'files:branch': 'bun scripts/read-branch-files.ts',
      'lint:files': 'oxlint --no-error-on-unmatched-pattern',
      'test:related': 'bun scripts/run-related-tests.ts',
    },
  });
});
