import { expect, test } from 'bun:test';
import { runInit } from './run-init.ts';

interface InitFixture {
  // The package.json the repo holds; null leaves the file out. Without it, the repo installs the
  // baseline's packages.
  readonly packageJSON?: object | null;

  readonly lefthook?: string;
}

function setupTest(fixture: Readonly<InitFixture> = {}) {
  const baselinePackage = {
    name: 'kettle',
    scripts: { test: 'bun test' },
    devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
  };

  const packageJSON = fixture.packageJSON === undefined ? baselinePackage : fixture.packageJSON;

  const tree = new Map<string, string>();

  if (packageJSON !== null) {
    tree.set('/repo/package.json', JSON.stringify(packageJSON));
  }

  if (fixture.lefthook !== undefined) {
    tree.set('/repo/lefthook.yml', fixture.lefthook);
  }

  const lines: string[] = [];

  const run = () =>
    runInit({
      repoRoot: '/repo',
      readText: (path) => Promise.resolve(tree.get(path) ?? null),
      writeText: (path, text) => {
        tree.set(path, text);

        return Promise.resolve();
      },
      writeOutput: (text) => {
        lines.push(`out ${text}`);
      },
      writeError: (text) => {
        lines.push(`err ${text}`);
      },
    });

  return { tree, lines, run, baselinePackage };
}

test('it writes the extends line and the check:docs script into a repo that has neither', async () => {
  const ctx = setupTest();

  const exitCode = await ctx.run();

  const packageText = ctx.tree.get('/repo/package.json') ?? '{}';
  const packageJSON: unknown = JSON.parse(packageText);

  expect({
    exitCode,
    lines: ctx.lines,
    lefthook: ctx.tree.get('/repo/lefthook.yml'),
    packageJSON,
  }).toStrictEqual({
    exitCode: 0,
    lines: [
      'out chex init: lefthook.yml extends node_modules/@zgeoff/chex/lefthook.yml\n',
      'out chex init: package.json runs "chex prose length links" as check:docs\n',
    ],
    lefthook: 'extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n',
    packageJSON: {
      ...ctx.baselinePackage,
      scripts: { test: 'bun test', 'check:docs': 'chex prose length links' },
    },
  });
});

test('it changes nothing on a second run', async () => {
  const ctx = setupTest();

  await ctx.run();

  const files = [...ctx.tree];

  ctx.lines.length = 0;

  const exitCode = await ctx.run();

  expect({ exitCode, lines: ctx.lines, files: [...ctx.tree] }).toStrictEqual({
    exitCode: 0,
    lines: ['out chex init: the repo already takes the baseline; nothing to change\n'],
    files,
  });
});

test('it keeps a check:docs script the repo already has', async () => {
  const ctx = setupTest({
    packageJSON: {
      devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
      scripts: { 'check:docs': 'chex length links vision' },
    },
    lefthook: 'extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n',
  });

  const exitCode = await ctx.run();

  expect({ exitCode, lines: ctx.lines }).toStrictEqual({
    exitCode: 0,
    lines: ['out chex init: the repo already takes the baseline; nothing to change\n'],
  });
});

test('it fails and writes nothing when the repo does not install rig and diet', async () => {
  const ctx = setupTest({ packageJSON: { devDependencies: { '@zgeoff/chex': '0.1.0' } } });

  const exitCode = await ctx.run();

  expect({ exitCode, lines: ctx.lines, files: [...ctx.tree.keys()] }).toStrictEqual({
    exitCode: 1,
    lines: [
      'err chex init: the baseline needs @zgeoff/rig, @zgeoff/diet installed; run bun add -d @zgeoff/rig @zgeoff/diet\n',
    ],
    files: ['/repo/package.json'],
  });
});

test('it fails and writes nothing when lefthook.yml lists extends inline', async () => {
  const ctx = setupTest({ lefthook: 'extends: [local.yml]\n' });
  const packageText = ctx.tree.get('/repo/package.json');

  const exitCode = await ctx.run();

  expect({
    exitCode,
    lines: ctx.lines,
    packageText: ctx.tree.get('/repo/package.json'),
  }).toStrictEqual({
    exitCode: 1,
    lines: [
      'err chex init: lefthook.yml writes extends in a form chex init does not edit; add node_modules/@zgeoff/chex/lefthook.yml to its list\n',
    ],
    packageText,
  });
});

test('it fails in a folder with no package.json', async () => {
  const ctx = setupTest({ packageJSON: null });

  const exitCode = await ctx.run();

  expect({ exitCode, lines: ctx.lines }).toStrictEqual({
    exitCode: 1,
    lines: ['err chex init: the folder has no package.json; run chex init from the repo root\n'],
  });
});
