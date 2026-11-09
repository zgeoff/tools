import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { $ } from 'bun';
import invariant from 'tiny-invariant';
import { collectRelativeImports } from '../scripts/src/collect-relative-imports.ts';
import { parseSyncEntries } from '../scripts/src/repo-sync/parse-sync-entries.ts';
import { writeTreeFiles } from './test-utils/write-tree-files.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'manifest-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  await $`git init --quiet`.cwd(directory);

  const manifestPath = join(import.meta.dir, 'manifest.json');

  const build =
    await $`jq -er '.[] | select(.name == "pre-push-baseline") | .build' ${manifestPath}`.text();

  return {
    directory,
    runBuild: async () => {
      await $`git add -A`.cwd(directory).quiet();

      return $`bash -euo pipefail -c ${build}`.cwd(directory).quiet();
    },
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
      'check:commits': 'bun scripts/run-commits-check.ts',
      'check:local-paths': 'bun scripts/run-local-paths-check.ts',
      'check:test-timeouts': 'bun scripts/run-test-timeouts-check.ts',
      'check:dependency-gates': 'bun scripts/dependency-gates/run-dependency-gates-check.ts',
      'check:workflows': 'bun scripts/run-workflows-check.ts',
      'check:uncommitted': 'bun scripts/run-uncommitted-check.ts',
      'memory-capped': 'bash scripts/run-memory-capped.sh "$(bun scripts/read-memory-budget.ts)"',
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
        'check:commits': 'commitlint --last',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
        'memory-capped': 'exec',
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
      'check:commits': 'commitlint --last',
      'check:local-paths': 'true',
      'check:test-timeouts': 'true',
      'check:dependency-gates': 'true',
      'check:workflows': 'true',
      'check:uncommitted': 'true',
      'memory-capped': 'exec',
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
      'check:commits': 'bun scripts/run-commits-check.ts',
      'check:local-paths': 'bun scripts/run-local-paths-check.ts',
      'check:test-timeouts': 'bun scripts/run-test-timeouts-check.ts',
      'check:dependency-gates': 'bun scripts/dependency-gates/run-dependency-gates-check.ts',
      'check:workflows': 'bun scripts/run-workflows-check.ts',
      'check:uncommitted': 'bun scripts/run-uncommitted-check.ts',
      'memory-capped': 'bash scripts/run-memory-capped.sh "$(bun scripts/read-memory-budget.ts)"',
    },
  });
});

test.each(['dependencies', 'devDependencies'])(
  'it runs a pre-push-baseline build that removes the related-tests runner, its command builder and the test of that builder from a repo whose %s list @zgeoff/rig and whose test:related runs rig',
  async (field) => {
    const ctx = await setupTest();

    await writeFile(
      join(ctx.directory, 'package.json'),
      JSON.stringify({
        scripts: { 'test:related': 'rig related' },
        [field]: { '@zgeoff/rig': '0.1.6' },
      }),
    );

    await mkdir(join(ctx.directory, 'scripts'));
    await writeFile(join(ctx.directory, 'scripts/run-related-tests.ts'), 'export {};\n');
    await writeFile(join(ctx.directory, 'scripts/build-related-test-command.ts'), 'export {};\n');

    await writeFile(
      join(ctx.directory, 'scripts/build-related-test-command.test.ts'),
      'export {};\n',
    );

    await writeFile(join(ctx.directory, 'scripts/read-worker-count.ts'), 'export {};\n');

    await ctx.runBuild();

    expect({
      runner: await Bun.file(join(ctx.directory, 'scripts/run-related-tests.ts')).exists(),
      command: await Bun.file(
        join(ctx.directory, 'scripts/build-related-test-command.ts'),
      ).exists(),
      commandTest: await Bun.file(
        join(ctx.directory, 'scripts/build-related-test-command.test.ts'),
      ).exists(),
      helper: await Bun.file(join(ctx.directory, 'scripts/read-worker-count.ts')).exists(),
      packageJSON: await ctx.readPackageJSON(),
    }).toStrictEqual({
      runner: false,
      command: false,
      commandTest: false,
      helper: false,
      packageJSON: {
        scripts: {
          'test:related': 'rig related',
          'files:branch': 'bun scripts/read-branch-files.ts',
          'lint:files': 'oxlint --no-error-on-unmatched-pattern',
          'check:commits': 'bun scripts/run-commits-check.ts',
          'check:local-paths': 'bun scripts/run-local-paths-check.ts',
          'check:test-timeouts': 'bun scripts/run-test-timeouts-check.ts',
          'check:dependency-gates': 'bun scripts/dependency-gates/run-dependency-gates-check.ts',
          'check:workflows': 'bun scripts/run-workflows-check.ts',
          'check:uncommitted': 'bun scripts/run-uncommitted-check.ts',
          'memory-capped':
            'bash scripts/run-memory-capped.sh "$(bun scripts/read-memory-budget.ts)"',
        },
        [field]: { '@zgeoff/rig': '0.1.6' },
      },
    });
  },
);

test.each([
  [
    'a test:related that still runs the runner',
    { 'test:related': 'bun scripts/run-related-tests.ts' },
  ],
  ['no test:related', {}],
])(
  'it runs a pre-push-baseline build that keeps the related-tests runner and its command builder in a repo on @zgeoff/rig with %s',
  async (_case, scripts) => {
    const ctx = await setupTest();

    await writeFile(
      join(ctx.directory, 'package.json'),
      JSON.stringify({ scripts, devDependencies: { '@zgeoff/rig': '0.1.6' } }),
    );

    await mkdir(join(ctx.directory, 'scripts'));
    await writeFile(join(ctx.directory, 'scripts/run-related-tests.ts'), 'export {};\n');
    await writeFile(join(ctx.directory, 'scripts/build-related-test-command.ts'), 'export {};\n');
    await writeFile(join(ctx.directory, 'scripts/read-worker-count.ts'), 'export {};\n');

    await ctx.runBuild();

    expect({
      runner: await Bun.file(join(ctx.directory, 'scripts/run-related-tests.ts')).exists(),
      command: await Bun.file(
        join(ctx.directory, 'scripts/build-related-test-command.ts'),
      ).exists(),
      helper: await Bun.file(join(ctx.directory, 'scripts/read-worker-count.ts')).exists(),
      packageJSON: await ctx.readPackageJSON(),
    }).toStrictEqual({
      runner: true,
      command: true,
      helper: true,
      packageJSON: {
        scripts: {
          'test:related': 'bun scripts/run-related-tests.ts',
          'files:branch': 'bun scripts/read-branch-files.ts',
          'lint:files': 'oxlint --no-error-on-unmatched-pattern',
          'check:commits': 'bun scripts/run-commits-check.ts',
          'check:local-paths': 'bun scripts/run-local-paths-check.ts',
          'check:test-timeouts': 'bun scripts/run-test-timeouts-check.ts',
          'check:dependency-gates': 'bun scripts/dependency-gates/run-dependency-gates-check.ts',
          'check:workflows': 'bun scripts/run-workflows-check.ts',
          'check:uncommitted': 'bun scripts/run-uncommitted-check.ts',
          'memory-capped':
            'bash scripts/run-memory-capped.sh "$(bun scripts/read-memory-budget.ts)"',
        },
        devDependencies: { '@zgeoff/rig': '0.1.6' },
      },
    });
  },
);

test('it runs a pre-push-baseline build that keeps the related-tests runner and adds the default test:related script in a repo without @zgeoff/rig', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { test: 'bun test' }, devDependencies: { '@zgeoff/chex': '0.9.0' } }),
  );

  await mkdir(join(ctx.directory, 'scripts'));
  await writeFile(join(ctx.directory, 'scripts/run-related-tests.ts'), 'export {};\n');
  await writeFile(join(ctx.directory, 'scripts/read-worker-count.ts'), 'export {};\n');

  await ctx.runBuild();

  expect({
    runner: await Bun.file(join(ctx.directory, 'scripts/run-related-tests.ts')).exists(),
    helper: await Bun.file(join(ctx.directory, 'scripts/read-worker-count.ts')).exists(),
    packageJSON: await ctx.readPackageJSON(),
  }).toStrictEqual({
    runner: true,
    helper: true,
    packageJSON: {
      scripts: {
        test: 'bun test',
        'files:branch': 'bun scripts/read-branch-files.ts',
        'lint:files': 'oxlint --no-error-on-unmatched-pattern',
        'test:related': 'bun scripts/run-related-tests.ts',
        'check:commits': 'bun scripts/run-commits-check.ts',
        'check:local-paths': 'bun scripts/run-local-paths-check.ts',
        'check:test-timeouts': 'bun scripts/run-test-timeouts-check.ts',
        'check:dependency-gates': 'bun scripts/dependency-gates/run-dependency-gates-check.ts',
        'check:workflows': 'bun scripts/run-workflows-check.ts',
        'check:uncommitted': 'bun scripts/run-uncommitted-check.ts',
        'memory-capped': 'bash scripts/run-memory-capped.sh "$(bun scripts/read-memory-budget.ts)"',
      },
      devDependencies: { '@zgeoff/chex': '0.9.0' },
    },
  });
});

test.each([
  [
    'its root package.json',
    'package.json',
    JSON.stringify({
      scripts: {
        'test:related': 'rig related',
        'test:workers': 'bun test --parallel=$(bun scripts/read-worker-count.ts)',
      },
      devDependencies: { '@zgeoff/rig': '0.1.6' },
    }),
  ],
  [
    'a workspace package.json',
    'packages/kiln/package.json',
    JSON.stringify({
      scripts: { test: 'bun test --parallel=$(bun ../../scripts/read-worker-count.ts)' },
    }),
  ],
  [
    'a workflow',
    '.github/workflows/test.yml',
    'run: bun test --parallel=$(bun scripts/read-worker-count.ts)\n',
  ],
])(
  'it runs a pre-push-baseline build that removes the related-tests runner but keeps the worker-count helper in a repo on @zgeoff/rig where %s calls the helper',
  async (_case, caller, callerText) => {
    const ctx = await setupTest();

    await writeFile(
      join(ctx.directory, 'package.json'),
      JSON.stringify({
        scripts: { 'test:related': 'rig related' },
        devDependencies: { '@zgeoff/rig': '0.1.6' },
      }),
    );

    await mkdir(join(ctx.directory, caller, '..'), { recursive: true });
    await writeFile(join(ctx.directory, caller), callerText);
    await mkdir(join(ctx.directory, 'scripts'), { recursive: true });
    await writeFile(join(ctx.directory, 'scripts/run-related-tests.ts'), 'export {};\n');
    await writeFile(join(ctx.directory, 'scripts/read-worker-count.ts'), 'export {};\n');

    await ctx.runBuild();

    expect({
      runner: await Bun.file(join(ctx.directory, 'scripts/run-related-tests.ts')).exists(),
      helper: await Bun.file(join(ctx.directory, 'scripts/read-worker-count.ts')).exists(),
    }).toStrictEqual({ runner: false, helper: true });
  },
);

test('it runs a pre-push-baseline build that keeps the related-tests runner and the worker-count helper in a repo on @zgeoff/rig whose workflow calls the runner', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({
      scripts: { 'test:related': 'rig related' },
      devDependencies: { '@zgeoff/rig': '0.1.6' },
    }),
  );

  await mkdir(join(ctx.directory, '.github/workflows'), { recursive: true });

  await writeFile(
    join(ctx.directory, '.github/workflows/test.yml'),
    'run: bun scripts/run-related-tests.ts src/kiln.ts\n',
  );

  await mkdir(join(ctx.directory, 'scripts'));
  await writeFile(join(ctx.directory, 'scripts/run-related-tests.ts'), 'export {};\n');
  await writeFile(join(ctx.directory, 'scripts/read-worker-count.ts'), 'export {};\n');

  await ctx.runBuild();

  expect({
    runner: await Bun.file(join(ctx.directory, 'scripts/run-related-tests.ts')).exists(),
    helper: await Bun.file(join(ctx.directory, 'scripts/read-worker-count.ts')).exists(),
  }).toStrictEqual({ runner: true, helper: true });
});

test('it runs a pre-push-baseline build that keeps the related-tests runner in a repo without @zgeoff/rig whose own test:related never calls it', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { 'test:related': 'bun test' } }),
  );

  await mkdir(join(ctx.directory, 'scripts'));
  await writeFile(join(ctx.directory, 'scripts/run-related-tests.ts'), 'export {};\n');
  await writeFile(join(ctx.directory, 'scripts/read-worker-count.ts'), 'export {};\n');

  await ctx.runBuild();

  expect({
    runner: await Bun.file(join(ctx.directory, 'scripts/run-related-tests.ts')).exists(),
    helper: await Bun.file(join(ctx.directory, 'scripts/read-worker-count.ts')).exists(),
  }).toStrictEqual({ runner: true, helper: true });
});

test.each([
  [
    'removes',
    'a repo on @zgeoff/rig',
    { scripts: { 'test:related': 'rig related' }, devDependencies: { '@zgeoff/rig': '0.1.6' } },
    false,
  ],
  [
    'keeps',
    'a repo without @zgeoff/rig',
    { scripts: { test: 'bun test' }, devDependencies: { '@zgeoff/chex': '0.9.0' } },
    true,
  ],
])(
  'it runs a pre-push-baseline build that %s the related-tests runner, its command builder, the test of that builder and the worker-count helper in %s, where the builder and its test name the runner and the helper',
  async (_verb, _case, packageJSON, kept) => {
    const ctx = await setupTest();

    await writeTreeFiles(ctx.directory, {
      'package.json': JSON.stringify(packageJSON),
      'scripts/run-related-tests.ts': 'export {};\n',
      'scripts/build-related-test-command.ts':
        '// Called by scripts/run-related-tests.ts with scripts/read-worker-count.ts.\nexport {};\n',
      'scripts/build-related-test-command.test.ts':
        "test('scripts/run-related-tests.ts reads scripts/read-worker-count.ts', () => {});\n",
      'scripts/read-worker-count.ts': 'export {};\n',
    });

    await ctx.runBuild();

    expect({
      runner: await Bun.file(join(ctx.directory, 'scripts/run-related-tests.ts')).exists(),
      command: await Bun.file(
        join(ctx.directory, 'scripts/build-related-test-command.ts'),
      ).exists(),
      commandTest: await Bun.file(
        join(ctx.directory, 'scripts/build-related-test-command.test.ts'),
      ).exists(),
      helper: await Bun.file(join(ctx.directory, 'scripts/read-worker-count.ts')).exists(),
    }).toStrictEqual({ runner: kept, command: kept, commandTest: kept, helper: kept });
  },
);

test('it runs a pre-push-baseline build that leaves no delivered script importing a file the build removed in a repo on @zgeoff/rig', async () => {
  const ctx = await setupTest();
  const manifestJSON: unknown = await Bun.file(join(import.meta.dir, 'manifest.json')).json();

  const entry = parseSyncEntries(manifestJSON)?.find(
    (candidate) => candidate.name === 'pre-push-baseline',
  );

  invariant(entry);

  const delivered = await Promise.all(
    entry.files.map(async (file): Promise<[string, string]> => {
      const text = await Bun.file(join(import.meta.dir, '..', file.source)).text();

      return [file.target, text];
    }),
  );

  await writeTreeFiles(ctx.directory, {
    ...Object.fromEntries(delivered),
    'package.json': JSON.stringify({
      scripts: { 'test:related': 'rig related' },
      devDependencies: { '@zgeoff/rig': '0.1.6' },
    }),
  });

  await ctx.runBuild();

  const scripts = await Array.fromAsync(new Bun.Glob('scripts/**/*.ts').scan(ctx.directory));

  const brokenImports = await Promise.all(
    scripts.map(async (script) => {
      const text = await Bun.file(join(ctx.directory, script)).text();

      const specifiers = collectRelativeImports(text, script);

      invariant(specifiers, `${script} does not parse`);

      const imports = await Promise.all(
        specifiers.map(async (specifier) => {
          const exists = await Bun.file(join(ctx.directory, dirname(script), specifier)).exists();

          return { line: `${script} imports ${specifier}`, exists };
        }),
      );

      return imports.filter((found) => !found.exists).map((found) => found.line);
    }),
  );

  expect(brokenImports.flat()).toStrictEqual([]);
});
