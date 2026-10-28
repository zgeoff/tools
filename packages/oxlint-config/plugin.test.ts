import { expect, test } from 'bun:test';
import { readFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { collectBannedVerbs } from './test-utils/collect-banned-verbs.ts';
import { createLintTree } from './test-utils/create-lint-tree.ts';
import { runLintIn } from './test-utils/run-lint-in.ts';
import { runLintTree } from './test-utils/run-lint-tree.ts';
import { runLint } from './test-utils/run-lint.ts';
import type { OxlintRun } from './test-utils/run-oxlint.ts';

test('it flags a multi-line JSDoc block', async () => {
  const source = '/**\n * Documents the export.\n */\nexport const answer = 42;\n';

  const result = await runLint(source, { 'zgeoff/no-jsdoc': 'error' });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('no-jsdoc');
});

test('it flags a single-line JSDoc block', async () => {
  const result = await runLint('/** Documents the export. */\nexport const answer = 42;\n', {
    'zgeoff/no-jsdoc': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('no-jsdoc');
});

test('it flags a JSDoc block inside a class body', async () => {
  const source = 'class Box {\n  /**\n   * Holds the value.\n   */\n  value = 1;\n}\n';

  const result = await runLint(source, { 'zgeoff/no-jsdoc': 'error' });

  expect(result.exitCode).toBe(1);
});

test('it leaves line comments and plain block comments alone', async () => {
  const source = [
    '// line comment',
    'export const b = 2;',
    '',
    '/* plain block */',
    'export const c = 3;',
    '',
    '/*',
    ' * plain multi-line block',
    ' */',
    'export const d = 4;',
    '',
  ].join('\n');

  const result = await runLint(source, { 'zgeoff/no-jsdoc': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it exempts inline @type and @lends casts', async () => {
  const source = 'export const config = /** @type {const} */ ({ port: 3000 });\n';

  const result = await runLint(source, { 'zgeoff/no-jsdoc': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it flags a run of four line comments and accepts three', async () => {
  const four = '// one\n// two\n// three\n// four\nexport const a = 1;\n';
  const three = '// one\n// two\n// three\nexport const a = 1;\n';

  const fourResult = await runLint(four, { 'zgeoff/max-consecutive-line-comments': 'error' });
  const threeResult = await runLint(three, { 'zgeoff/max-consecutive-line-comments': 'error' });

  expect(fourResult.exitCode).toBe(1);
  expect(fourResult.stdout).toInclude('max-consecutive-line-comments');
  expect(fourResult.stdout).toInclude('4 lines; the limit is 3');
  expect(threeResult.exitCode).toBe(0);
});

test('it honours the max option', async () => {
  const source = '// one\n// two\nexport const a = 1;\n';

  const result = await runLint(source, {
    'zgeoff/max-consecutive-line-comments': ['error', { max: 1 }],
  });

  expect(result.exitCode).toBe(1);
});

test('it ends a run at a blank line, a statement, or a trailing comment', async () => {
  const source = [
    '// one',
    '// two',
    '',
    '// three',
    '// four',
    'export const a = 1; // trailing',
    '// five',
    '// six',
    '',
  ].join('\n');

  const result = await runLint(source, { 'zgeoff/max-consecutive-line-comments': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it neither counts a tool directive nor joins the prose around it', async () => {
  const source = [
    '// one',
    '// two',
    '// oxlint-disable-next-line no-console -- baseline',
    '// three',
    '// four',
    'console.log(1);',
    '',
  ].join('\n');

  const result = await runLint(source, { 'zgeoff/max-consecutive-line-comments': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it counts an indented run inside a block', async () => {
  const source = [
    'export function run(): void {',
    '  // one',
    '  // two',
    '  // three',
    '  // four',
    '  return;',
    '}',
    '',
  ].join('\n');

  const result = await runLint(source, { 'zgeoff/max-consecutive-line-comments': 'error' });

  expect(result.exitCode).toBe(1);
});

test('it accepts a free verb outside the role table', async () => {
  const source = 'export function grabConfig(): number {\n  return 1;\n}\n';

  const result = await runLint(source, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it points a banned verb at its replacement', async () => {
  const source = 'export function fetchUser(): number {\n  return 1;\n}\n';

  const result = await runLint(source, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude("banned verb 'fetch'");
  expect(result.stdout).toInclude('`read`');
});

test('it tells a vague banned verb to name what the function does', async () => {
  const source = 'export function processInput(): number {\n  return 1;\n}\n';

  const result = await runLint(source, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('name what the function does');
});

test('it accepts role-table verbs on declarations, const functions, and class methods', async () => {
  const source = [
    'export function buildThing(): number {',
    '  return 1;',
    '}',
    '',
    'export function withScope(run: () => void): void {',
    '  const applyAll = () => run();',
    '',
    '  applyAll();',
    '}',
    '',
    'export class Box {',
    '  updateValue(): void {}',
    '}',
    '',
  ].join('\n');

  const result = await runLint(source, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(0);
});

test.each(['to', 'with', 'make', 'use', 'on'])(
  'it rejects the bare template prefix %s',
  async (prefix) => {
    const source = `export const api = {\n  ${prefix}(): void {},\n};\n`;

    const result = await runLint(source, { 'zgeoff/function-verb': 'error' });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toInclude(`'${prefix}' is a bare prefix`);
  },
);

test('it accepts each template prefix with a suffix', async () => {
  const source = [
    'export const toPosixPath = (): void => {};',
    'export const withScope = (): void => {};',
    'export const makeExcluder = (): void => {};',
    'export const useDebounce = (): void => {};',
    'export const onRowClick = (): void => {};',
    'export const handleRowClick = (): void => {};',
    '',
  ].join('\n');

  const result = await runLint(source, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it reports a bare handle as a vague banned verb', async () => {
  const result = await runLint('export const handle = (): void => {};\n', {
    'zgeoff/function-verb': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude("'handle' starts with the banned verb 'handle'");
});

test('it matches a banned verb only at a camelCase boundary', async () => {
  const source = 'export function processionLength(): number {\n  return 1;\n}\n';

  const result = await runLint(source, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it accepts a digit as the boundary after a verb', async () => {
  const source = [
    'export function run2FA(): void {}',
    '',
    'export function get2FAVerificationURI(): string {',
    "  return '';",
    '}',
    '',
  ].join('\n');

  const result = await runLint(source, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it flags a banned verb at a digit boundary', async () => {
  const source = 'export function save2FABackupCodes(): void {}\n';

  const result = await runLint(source, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude("banned verb 'save'");
});

test('it flags a banned verb on object-literal methods and arrow properties', async () => {
  const source = [
    'export const store = {',
    '  fetchUser(): number {',
    '    return 1;',
    '  },',
    '  saveUser: (): void => {},',
    '};',
    '',
  ].join('\n');

  const result = await runLint(source, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude("'fetchUser' starts with the banned verb 'fetch'");
  expect(result.stdout).toInclude("'saveUser' starts with the banned verb 'save'");
});

test('it skips PascalCase names, getters, setters, and quoted keys', async () => {
  const source = [
    'export function Component(): null {',
    '  return null;',
    '}',
    '',
    'export const visitor = {',
    "  'fetch:exit'(): void {},",
    '};',
    '',
    'export class Box {',
    '  get process(): number {',
    '    return 1;',
    '  }',
    '',
    '  get value(): number {',
    '    return 1;',
    '  }',
    '',
    '  set value(next: number) {}',
    '}',
    '',
  ].join('\n');

  const result = await runLint(source, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it skips names listed in the exemptNames option', async () => {
  const source = 'export function executeQuery(): void {}\n';

  const result = await runLint(source, {
    'zgeoff/function-verb': ['error', { exemptNames: ['executeQuery'] }],
  });

  expect(result.exitCode).toBe(0);
});

test('it rejects every verb the shared skill bans', async () => {
  const markdown = await readFile(
    join(import.meta.dir, '..', '..', '.claude', 'skills', 'code-style', 'SKILL.md'),
    'utf8',
  );

  const banned = collectBannedVerbs(markdown).filter((verb) => verb !== 'handle');

  expect(banned.length).toBeGreaterThan(10);

  const lines = banned.map((verb) => `export function ${verb}Thing(): void {}`);

  const result = await runLint(`${lines.join('\n')}\n`, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(1);

  for (const verb of banned) {
    expect(result.stdout).toInclude(`${verb}Thing`);
  }
});

test('it flags a test file with no module beside it', async () => {
  const result = await runLintTree(
    {
      'src/parse-entry.test.ts': "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
      'src/other.ts': '',
    },
    'src/parse-entry.test.ts',
    { 'zgeoff/test-beside-module': 'error' },
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('test-beside-module');
  expect(result.stdout).toInclude('parse-entry.<ext>');
});

test('it flags a .test.tsx file with no module beside it', async () => {
  const result = await runLintTree(
    { 'src/view.test.tsx': "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n" },
    'src/view.test.tsx',
    { 'zgeoff/test-beside-module': 'error' },
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('view.<ext>');
});

test.each([
  ['parse-entry.ts', 'parse-entry.test.ts'],
  ['view.tsx', 'view.test.ts'],
  ['install.sh', 'install.test.ts'],
  ['turbo.json', 'turbo.test.ts'],
])('it accepts a test beside the module %s', async (module, testFile) => {
  const result = await runLintTree(
    {
      [module]: '',
      [testFile]: "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
    },
    testFile,
    { 'zgeoff/test-beside-module': 'error' },
  );

  expect(result.exitCode).toBe(0);
});

test('it accepts a .test.tsx file beside its module', async () => {
  const result = await runLintTree(
    {
      'view.tsx': '',
      'view.test.tsx': "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
    },
    'view.test.tsx',
    { 'zgeoff/test-beside-module': 'error' },
  );

  expect(result.exitCode).toBe(0);
});

test('it counts neither another test nor a declaration file as the module', async () => {
  const declaration = await runLintTree(
    {
      'egress.test.ts': "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
      'egress.d.ts': '',
    },
    'egress.test.ts',
    { 'zgeoff/test-beside-module': 'error' },
  );

  const otherTest = await runLintTree(
    {
      'egress.test.ts': "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
      'egress.test.test.ts': "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
    },
    'egress.test.test.ts',
    { 'zgeoff/test-beside-module': 'error' },
  );

  expect(declaration.exitCode).toBe(1);
  expect(declaration.stdout).toInclude('egress.<ext>');
  expect(otherTest.exitCode).toBe(1);
  expect(otherTest.stdout).toInclude('egress.test.<ext>');
});

test('it counts a symlinked module', async () => {
  const directory = await createLintTree(
    {
      'real.ts': '',
      'link.test.ts': "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
    },
    { 'zgeoff/test-beside-module': 'error' },
  );

  await symlink(join(directory, 'real.ts'), join(directory, 'link.ts'));

  const result = await runLintIn(directory, directory, 'link.test.ts');

  expect(result.exitCode).toBe(0);
});

test('it accepts a browser suite beside its module', async () => {
  const result = await runLintTree(
    {
      'view.tsx': '',
      'view.browser.test.ts': "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
    },
    'view.browser.test.ts',
    { 'zgeoff/test-beside-module': 'error' },
  );

  expect(result.exitCode).toBe(0);
});

test('it flags a browser suite with no module beside it', async () => {
  const result = await runLintTree(
    {
      'view.browser.test.ts': "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
      'other.ts': '',
    },
    'view.browser.test.ts',
    { 'zgeoff/test-beside-module': 'error' },
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('view.<ext>');
});

test('it accepts a suite in a configured lane beside its module', async () => {
  const result = await runLintTree(
    {
      'session.ts': '',
      'session.sdk.test.ts': "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
    },
    'session.sdk.test.ts',
    { 'zgeoff/test-beside-module': ['error', { lanes: ['sdk'] }] },
  );

  expect(result.exitCode).toBe(0);
});

test('it flags a suite in a configured lane with no module beside it', async () => {
  const result = await runLintTree(
    {
      'session.sdk.test.ts': "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
      'other.ts': '',
    },
    'session.sdk.test.ts',
    { 'zgeoff/test-beside-module': ['error', { lanes: ['sdk'] }] },
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('session.<ext>');
});

test('it treats a lane suffix as part of the name until the lane is configured', async () => {
  const result = await runLintTree(
    {
      'session.ts': '',
      'session.sdk.test.ts': "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
    },
    'session.sdk.test.ts',
    { 'zgeoff/test-beside-module': 'error' },
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('session.sdk.<ext>');
});

test('it keeps the browser lane when more lanes are configured', async () => {
  const result = await runLintTree(
    {
      'view.tsx': '',
      'view.browser.test.ts': "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
    },
    'view.browser.test.ts',
    { 'zgeoff/test-beside-module': ['error', { lanes: ['sdk'] }] },
  );

  expect(result.exitCode).toBe(0);
});

test('it flags a test-kind suffix test beside only the base module', async () => {
  const result = await runLintTree(
    {
      'egress-ruleset.ts': '',
      'egress-ruleset.replay.test.ts':
        "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
    },
    'egress-ruleset.replay.test.ts',
    { 'zgeoff/test-beside-module': 'error' },
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('egress-ruleset.replay.<ext>');
});

test.each(['docker', 'host', 'agent-sdk'])(
  'it accepts a suite in the standard %s lane beside its module',
  async (lane) => {
    const result = await runLintTree(
      {
        'session.ts': '',
        [`session.${lane}.test.ts`]:
          "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
      },
      `session.${lane}.test.ts`,
      { 'zgeoff/test-beside-module': 'error' },
    );

    expect(result.exitCode).toBe(0);
  },
);

test('it accepts a suite in a lane that the object form of the lanes option declares', async () => {
  const result = await runLintTree(
    {
      'session.ts': '',
      'session.kvm.test.ts': "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
    },
    'session.kvm.test.ts',
    { 'zgeoff/test-beside-module': ['error', { lanes: { kvm: 60_000 } }] },
  );

  expect(result.exitCode).toBe(0);
});

test('it exempts tests under a root e2e/ or evals/ directory', async () => {
  const e2e = await runLintTree(
    { 'e2e/cli.test.ts': "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n" },
    'e2e/cli.test.ts',
    { 'zgeoff/test-beside-module': 'error' },
  );

  const evals = await runLintTree(
    {
      'evals/agent/plan.test.ts':
        "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
    },
    'evals/agent/plan.test.ts',
    { 'zgeoff/test-beside-module': 'error' },
  );

  expect(e2e.exitCode).toBe(0);
  expect(evals.exitCode).toBe(0);
});

test.each([
  ['a root integration/ directory', 'integration/checkout.test.ts'],
  ['an app root e2e/ directory', 'packages/cli/e2e/run.test.ts'],
  ['an app root integration/ directory', 'packages/cli/integration/run.test.ts'],
  ['an app root evals/ directory', 'packages/cli/evals/run.test.ts'],
  ['a package whose directory ends in -e2e', 'apps/cli-e2e/src/run.test.ts'],
])('it exempts a test under %s', async (_, path) => {
  const result = await runLintTree(
    {
      'packages/cli/package.json': '{}',
      'apps/cli-e2e/package.json': '{}',
      [path]: "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
    },
    path,
    { 'zgeoff/test-beside-module': 'error' },
  );

  expect(result.exitCode).toBe(0);
});

test('it flags tests under test-utils/ or an e2e/ directory outside an app root', async () => {
  const testUtils = await runLintTree(
    {
      'test-utils/fixtures.test.ts':
        "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
    },
    'test-utils/fixtures.test.ts',
    { 'zgeoff/test-beside-module': 'error' },
  );

  const nestedE2E = await runLintTree(
    {
      'packages/cli/e2e/run.test.ts':
        "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
    },
    'packages/cli/e2e/run.test.ts',
    { 'zgeoff/test-beside-module': 'error' },
  );

  expect(testUtils.exitCode).toBe(1);
  expect(testUtils.stdout).toInclude('fixtures.<ext>');
  expect(nestedE2E.exitCode).toBe(1);
  expect(nestedE2E.stdout).toInclude('run.<ext>');
});

test('it anchors the e2e/ exemption on the repo root, not the working directory', async () => {
  const directory = await createLintTree(
    {
      '.git/HEAD': '',
      'e2e/root.test.ts': "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
      'packages/cli/e2e/run.test.ts':
        "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
    },
    { 'zgeoff/test-beside-module': 'error' },
  );

  const packageCWD = join(directory, 'packages', 'cli');

  const nested = await runLintIn(directory, packageCWD, 'e2e/run.test.ts');
  const root = await runLintIn(directory, packageCWD, join(directory, 'e2e', 'root.test.ts'));

  expect(nested.exitCode).toBe(1);
  expect(nested.stdout).toInclude('run.<ext>');
  expect(root.exitCode).toBe(0);
});

test('it honours a file-level disable comment with a reason', async () => {
  const source = `// oxlint-disable zgeoff/test-beside-module -- tests two configs at once\nimport { test } from 'bun:test';\n\ntest('it runs', () => {});\n`;

  const result = await runLintTree({ 'configs.test.ts': source }, 'configs.test.ts', {
    'zgeoff/test-beside-module': 'error',
  });

  expect(result.exitCode).toBe(0);
});

test.each(['toMatchSnapshot', 'toThrowErrorMatchingSnapshot'])(
  'it flags the file-backed %s matcher',
  async (matcher) => {
    const source = `import { expect, test } from 'bun:test';\n\ntest('it renders the banner', () => {\n  expect('ready').${matcher}();\n});\n`;

    const result = await runLint(source, { 'zgeoff/no-file-snapshot': 'error' });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toInclude('no-file-snapshot');
    expect(result.stdout).toInclude(matcher);
  },
);

test('it flags a negated and a computed file snapshot matcher', async () => {
  const source =
    "import { expect, test } from 'bun:test';\n\ntest('it renders the banner', () => {\n  expect('ready').not.toMatchSnapshot();\n  expect('ready')['toMatchSnapshot']();\n});\n";

  const result = await runLint(source, { 'zgeoff/no-file-snapshot': 'error' });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('sample.ts:4:23');
  expect(result.stdout).toInclude('sample.ts:5:19');
});

test('it accepts inline snapshot matchers', async () => {
  const source =
    "import { expect, test } from 'bun:test';\n\ntest('it renders the banner', () => {\n  expect('ready').toMatchInlineSnapshot(`\"ready\"`);\n  expect(() => {\n    throw new Error('late');\n  }).toThrowErrorMatchingInlineSnapshot(`\"late\"`);\n});\n";

  const result = await runLint(source, { 'zgeoff/no-file-snapshot': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it flags a test file with a snapshot file beside it in __snapshots__/', async () => {
  const result = await runLintTree(
    {
      'src/banner.ts': '',
      'src/banner.test.ts': "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
      'src/__snapshots__/banner.test.ts.snap': '// Bun Snapshot v1\n',
    },
    'src/banner.test.ts',
    { 'zgeoff/no-file-snapshot': 'error' },
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('no-file-snapshot');
  expect(result.stdout).toInclude('__snapshots__/banner.test.ts.snap');
});

test('it accepts a test file whose name no snapshot file in __snapshots__/ matches', async () => {
  const result = await runLintTree(
    {
      'banner.test.ts': "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n",
      '__snapshots__/footer.test.ts.snap': '// Bun Snapshot v1\n',
    },
    'banner.test.ts',
    { 'zgeoff/no-file-snapshot': 'error' },
  );

  expect(result.exitCode).toBe(0);
});

test('it honours a file-level disable comment on a snapshot file', async () => {
  const source = `// oxlint-disable zgeoff/no-file-snapshot -- migrates the legacy golden files\nimport { test } from 'bun:test';\n\ntest('it runs', () => {});\n`;

  const result = await runLintTree(
    { 'banner.test.ts': source, '__snapshots__/banner.test.ts.snap': '// Bun Snapshot v1\n' },
    'banner.test.ts',
    { 'zgeoff/no-file-snapshot': 'error' },
  );

  expect(result.exitCode).toBe(0);
});

test('it accepts a test file of imports, types, setupTest and test calls', async () => {
  const source =
    "import { expect, test } from 'bun:test';\nimport type { Kettle } from './kettle';\n\ntype Reading = Readonly<{ celsius: number }>;\n\ninterface Brew {\n  kettle: Kettle;\n}\n\nfunction setupTest() {\n  return { reading: { celsius: 90 } satisfies Reading };\n}\n\ntest('it boils', () => {\n  const ctx = setupTest();\n\n  expect(ctx.reading.celsius).toBe(90);\n});\n\ntest.each([[1, 2]])('it adds %d', (left, right) => {\n  expect(left + 1).toBe(right);\n});\n\ntest.skipIf(process.platform === 'win32')('it steeps', () => {});\n\ntest.if(process.platform === 'linux')('it pours', () => {});\n\ntest.skipIf(false).each([[1]])('it chains %d', () => {});\n";

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.stdout).not.toInclude('setup-test-only');
});

test('it accepts a mod check file whose test comes from claude-code/testing', async () => {
  const source =
    "import { expect, test } from 'claude-code/testing';\n\nfunction setupTest() {\n  return { cups: 2 };\n}\n\ntest('it pours', () => {\n  const ctx = setupTest();\n\n  expect(ctx.cups).toBe(2);\n});\n";

  const result = await runLintTree({ 'teapot.test.ts': source }, 'teapot.test.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.stdout).not.toInclude('setup-test-only');
});

test('it flags only the second function beside setupTest in a mod check file', async () => {
  const source =
    "import { test } from 'claude-code/testing';\n\nfunction setupTest() {\n  return {};\n}\n\nfunction readPot() {\n  return 2;\n}\n\ntest('it pours', () => {});\n";

  const result = await runLintTree({ 'teapot.test.ts': source }, 'teapot.test.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Remove the module-level `readPot`');
  expect(result.stdout).not.toInclude('Move this statement into a test or `setupTest()`');
});

test.each([
  ['a module-level const', 'const pot = { cups: 2 };\n', 'pot'],
  ['a module-level let', 'let pot = 2;\n', 'pot'],
  ['a module-level var', 'var pot = 2;\n', 'pot'],
  ['a helper function', 'function buildPot() {\n  return { cups: 2 };\n}\n', 'buildPot'],
  ['a class', 'class Pot {}\n', 'Pot'],
  ['an enum', 'enum Pot {\n  Small,\n}\n', 'Pot'],
  [
    'a second function beside setupTest',
    'function setupTest() {\n  return {};\n}\n\nfunction readPot() {\n  return 2;\n}\n',
    'readPot',
  ],
  [
    'a second setupTest',
    'function setupTest() {\n  return {};\n}\n\nfunction setupTest() {\n  return {};\n}\n',
    'setupTest',
  ],
])('it flags %s and names it', async (_, declaration, name) => {
  const source = `import { test } from 'bun:test';\n\n${declaration}\ntest('it pours', () => {});\n`;

  const result = await runLintTree({ 'pot.test.ts': source }, 'pot.test.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('setup-test-only');
  expect(result.stdout).toInclude(`Remove the module-level \`${name}\``);
});

test('it names the three ways out of a module-level declaration', async () => {
  const source =
    "import { test } from 'bun:test';\n\nconst cups = 2;\n\ntest('it pours', () => {});\n";

  const result = await runLintTree({ 'pot.test.tsx': source }, 'pot.test.tsx', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Inline it where it is used');
  expect(result.stdout).toInclude('swap it for a registered matcher');
  expect(result.stdout).toInclude('move it to the shared test utils with tests of its own');
});

test.each([
  ['a hook call', 'beforeEach(() => {});\n'],
  ['an exported const', 'export const cups = 2;\n'],
  ['an exported type', 'export type Cups = number;\n'],
])('it flags %s at module level', async (_, statement) => {
  const source = `import { beforeEach, test } from 'bun:test';\n\n${statement}\ntest('it pours', () => {});\n`;

  const result = await runLintTree({ 'pot.test.ts': source }, 'pot.test.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Move this statement into a test or `setupTest()`');
});

test.each([
  ['an aliased bun:test import', "import { beforeEach as test } from 'bun:test';\n"],
  ['a default import', "import test from './runner';\n"],
  ['a namespace import', "import * as test from './runner';\n"],
  ['a function declaration', 'function test(callback: () => void) {\n  callback();\n}\n'],
  ['a const', 'const test = (callback: () => void) => callback();\n'],
  ['a class', 'class test {}\n'],
])('it flags a call of a module binding named test that %s defines', async (_, binding) => {
  const source = `${binding}\ntest(() => {});\n`;

  const result = await runLintTree({ 'hooks.test.ts': source }, 'hooks.test.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Move this statement into a test or `setupTest()`');
});

test('it accepts a skip gate that only skipIf arguments read', async () => {
  const source =
    "import { test } from 'bun:test';\nimport { probeKettle } from './probe-kettle';\n\n// skipIf takes a boolean and has no in-body skip\nconst hasKettle = await probeKettle();\n\ntest.skipIf(!hasKettle)('it boils', () => {});\n\ntest.skipIf(!hasKettle)('it whistles', () => {});\n";

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.stdout).not.toInclude('setup-test-only');
});

test('it accepts a gate derived from the probe when only skipIf reads the derived gate', async () => {
  const source =
    "import { test } from 'bun:test';\nimport { probeKettle } from './probe-kettle';\n\n// skipIf takes a boolean and has no in-body skip\nconst hasKettle = await probeKettle();\nconst skipBoil = !hasKettle || process.platform === 'win32';\n\ntest.skipIf(skipBoil)('it boils', () => {});\n";

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.stdout).not.toInclude('setup-test-only');
});

test('it flags a skip gate that a test body reads', async () => {
  const source =
    "import { expect, test } from 'bun:test';\nimport { probeKettle } from './probe-kettle';\n\nconst hasKettle = await probeKettle();\n\ntest.skipIf(!hasKettle)('it boils', () => {\n  expect(hasKettle).toBeTrue();\n});\n";

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Remove the module-level `hasKettle`');
});

test('it flags a gate derived from a probe that a test body reads', async () => {
  const source =
    "import { expect, test } from 'bun:test';\nimport { probeKettle } from './probe-kettle';\n\nconst hasKettle = await probeKettle();\nconst skipBoil = !hasKettle;\n\ntest.skipIf(skipBoil)('it boils', () => {\n  expect(hasKettle).toBeTrue();\n});\n";

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Remove the module-level `hasKettle`');
  expect(result.stdout).not.toInclude('Remove the module-level `skipBoil`');
});

test('it accepts a destructured probe whose every member only skipIf arguments read', async () => {
  const source =
    "import { test } from 'bun:test';\nimport { probeKitchen } from './probe-kitchen';\n\n// skipIf takes a boolean and has no in-body skip\nconst { hasKettle, hasStove } = await probeKitchen();\n\ntest.skipIf(!hasKettle)('it boils', () => {});\n\ntest.skipIf(!hasStove)('it simmers', () => {});\n";

  const result = await runLintTree({ 'kitchen.test.ts': source }, 'kitchen.test.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.stdout).not.toInclude('setup-test-only');
});

test('it flags a destructured probe with a member that nothing reads', async () => {
  const source =
    "import { test } from 'bun:test';\nimport { probeKitchen } from './probe-kitchen';\n\nconst { hasKettle, readStove } = await probeKitchen();\n\ntest.skipIf(!hasKettle)('it boils', () => {});\n";

  const result = await runLintTree({ 'kitchen.test.ts': source }, 'kitchen.test.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('readStove');
});

test('it flags consts that only read each other', async () => {
  const source =
    "import { test } from 'bun:test';\n\nconst first = () => second;\nconst second = () => first;\n\ntest('it pours', () => {});\n";

  const result = await runLintTree({ 'pot.test.ts': source }, 'pot.test.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Remove the module-level `first`');
  expect(result.stdout).toInclude('Remove the module-level `second`');
});

test('it flags a helper that only another helper reads', async () => {
  const source =
    "import { expect, test } from 'bun:test';\n\nconst cups = 2;\nconst doubled = cups * 2;\n\ntest('it pours', () => {\n  expect(doubled).toBe(4);\n});\n";

  const result = await runLintTree({ 'pot.test.ts': source }, 'pot.test.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Remove the module-level `cups`');
  expect(result.stdout).toInclude('Remove the module-level `doubled`');
});

test('it flags a gate that only a skipIf inside setupTest reads', async () => {
  const source =
    "import { test } from 'bun:test';\n\nconst hasKettle = true;\n\nfunction setupTest() {\n  return test.skipIf(hasKettle);\n}\n\ntest('it boils', () => {\n  setupTest();\n});\n";

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Remove the module-level `hasKettle`');
});

test('it flags a probe that only a function inside a gate initializer reads', async () => {
  const source =
    "import { test } from 'bun:test';\n\nconst hasKettle = true;\nconst skipBoil = (() => !hasKettle)();\n\ntest.skipIf(skipBoil)('it boils', () => {});\n";

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Remove the module-level `hasKettle`');
  expect(result.stdout).not.toInclude('`skipBoil`');
});

test('it accepts a probe and its derived gate in one declaration', async () => {
  const source =
    "import { test } from 'bun:test';\nimport { probeKettle } from './probe-kettle';\n\n// skipIf takes a boolean and has no in-body skip\nconst hasKettle = await probeKettle(),\n  skipBoil = !hasKettle;\n\ntest.skipIf(skipBoil)('it boils', () => {});\n";

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.stdout).not.toInclude('setup-test-only');
});

test('it names only the non-gate binding of a declaration that holds a gate', async () => {
  const source =
    "import { expect, test } from 'bun:test';\nimport { probeKettle } from './probe-kettle';\n\nconst hasKettle = await probeKettle(),\n  cups = 2;\n\ntest.skipIf(!hasKettle)('it pours', () => {\n  expect(cups).toBe(2);\n});\n";

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Remove the module-level `cups`');
  expect(result.stdout).not.toInclude('`hasKettle`');
});

test.each([
  ['an empty object pattern', true, 'const {} = probeKitchen();\n'],
  ['an empty array pattern', true, 'const [] = probeKitchen();\n'],
  [
    'a nested object pattern',
    false,
    "const {\n  kitchen: { hasKettle },\n} = await probeKitchen();\n\ntest.skipIf(!hasKettle)('it boils', () => {});\n",
  ],
  [
    'a nested array pattern',
    false,
    "const [[hasKettle]] = await probeKitchen();\n\ntest.skipIf(!hasKettle)('it boils', () => {});\n",
  ],
  [
    'an unread rest element',
    true,
    "const { hasKettle, ...others } = await probeKitchen();\n\ntest.skipIf(!hasKettle)('it boils', () => {});\n",
  ],
  [
    'a rest element read in skipIf',
    false,
    "const { ...kitchen } = await probeKitchen();\n\ntest.skipIf(!kitchen.hasKettle)('it boils', () => {});\n",
  ],
  [
    'a default value',
    false,
    "const { hasKettle = false } = await probeKitchen();\n\ntest.skipIf(!hasKettle)('it boils', () => {});\n",
  ],
  [
    'a default value that reads a non-gate',
    true,
    "const cups = 2;\nconst { hasKettle = cups > 1 } = await probeKitchen();\n\ntest.skipIf(!hasKettle)('it boils', () => {});\n",
  ],
])('it reports a gate declared with %s: %p', async (_, expected, body) => {
  const source = `import { test } from 'bun:test';\nimport { probeKitchen } from './probe-kitchen';\n\n${body}`;

  const result = await runLintTree({ 'kitchen.test.ts': source }, 'kitchen.test.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.stdout.includes('setup-test-only')).toBe(expected);
});

test.each([
  [
    'test',
    false,
    "import { test } from 'bun:test';\n",
    "test.skipIf(!hasKettle)('it boils', () => {});\n",
  ],
  ['the global test', false, '', "test.skipIf(!hasKettle)('it boils', () => {});\n"],
  [
    'an aliased test import',
    false,
    "import { test as check } from 'bun:test';\n",
    "check.skipIf(!hasKettle)('it boils', () => {});\n",
  ],
  [
    'a member chain',
    false,
    "import { test } from 'bun:test';\n",
    "test.skipIf(!hasKettle).each([[1]])('it boils %d', () => {});\n",
  ],
  [
    'another object',
    true,
    "import { test } from 'bun:test';\nimport { matrix } from './matrix';\n",
    "test.each(matrix.skipIf(hasKettle))('it boils', () => {});\n",
  ],
  [
    'test.each',
    true,
    "import { test } from 'bun:test';\n",
    "test.each([[hasKettle]])('it boils %p', () => {});\n",
  ],
  [
    'a test name that an alias replaced',
    true,
    "import { test as check } from 'bun:test';\n",
    "test.skipIf(!hasKettle)('it boils', () => {});\n",
  ],
])('it reports a gate whose skipIf receiver is %s: %p', async (_, expected, imports, call) => {
  const source = `${imports}import { probeKettle } from './probe-kettle';\n\nconst hasKettle = await probeKettle();\n\n${call}`;

  const result = await runLintTree({ 'kettle.test.ts': source }, 'kettle.test.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.stdout.includes('setup-test-only')).toBe(expected);
});

test('it flags a module-level const that nothing reads', async () => {
  const source =
    "import { test } from 'bun:test';\n\nconst cups = 2;\n\ntest('it pours', () => {});\n";

  const result = await runLintTree({ 'pot.test.ts': source }, 'pot.test.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Remove the module-level `cups`');
});

test('it accepts module-level declarations in a file that is not a test', async () => {
  const source = 'const cups = 2;\n\nexport function readCups() {\n  return cups;\n}\n';

  const result = await runLintTree({ 'pot.ts': source }, 'pot.ts', {
    'zgeoff/setup-test-only': 'error',
  });

  expect(result.stdout).not.toInclude('setup-test-only');
});

test.each([
  ['string', "export const label = 'ask the orb daemon';\n"],
  ['template', 'export const label = `ask the orbd`;\n'],
  ['comment', '// the orb owns this socket\nexport const label = 1;\n'],
  ['comment', '/* the orb owns this socket */\nexport const label = 1;\n'],
])('it flags a restricted word in a %s', async (place, source) => {
  const result = await runLint(source, {
    'zgeoff/no-restricted-words': ['error', { words: ['orb', 'orbd'] }],
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('no-restricted-words');
  expect(result.stdout).toInclude(`from this ${place}`);
});

test('it flags a restricted word whatever its case and names it as written', async () => {
  const source = "export const label = 'the ORB daemon';\n";

  const result = await runLint(source, {
    'zgeoff/no-restricted-words': ['error', { words: ['orb', 'orbd'] }],
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Remove `ORB`');
});

test('it flags a restricted word bounded by punctuation', async () => {
  const source = "export const socket = '/run/orbd.sock';\nexport const vault = 'orb-e2e';\n";

  const result = await runLint(source, {
    'zgeoff/no-restricted-words': ['error', { words: ['orb', 'orbd'] }],
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Remove `orbd`');
  expect(result.stdout).toInclude('Remove `orb`');
});

test('it accepts a word that holds a restricted word inside it', async () => {
  const source =
    '// the orbit keeps its own clock\nexport const label = `orbs, absorb, sorbet, orb_name, orb2`;\n';

  const result = await runLint(source, {
    'zgeoff/no-restricted-words': ['error', { words: ['orb', 'orbd'] }],
  });

  expect(result.exitCode).toBe(0);
});

test('it accepts a restricted word as an identifier', async () => {
  const source = 'const orb = 1;\n\nexport const label = orb;\n';

  const result = await runLint(source, {
    'zgeoff/no-restricted-words': ['error', { words: ['orb', 'orbd'] }],
  });

  expect(result.exitCode).toBe(0);
});

test('it treats a restricted word as text, not as a pattern', async () => {
  const rules = { 'zgeoff/no-restricted-words': ['error', { words: ['a.b'] }] };
  const source = "export const label = 'axb';\nexport const other = 'a.b';\n";

  const result = await runLint(source, rules);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('sample.ts:2:');
  expect(result.stdout).not.toInclude('sample.ts:1:');
});

test('it reports nothing when the config names no words', async () => {
  const source = "export const label = 'ask the orb daemon';\n";

  const result = await runLint(source, { 'zgeoff/no-restricted-words': 'error' });

  expect(result.exitCode).toBe(0);
});

// the rule's names sit in rows rather than object keys, so this file passes
// the rule
test.each([
  ['a variable', 'export const NAME = 1;\n'],
  ['a loop variable', 'for (const NAME of [1]) {\n  globalThis.value = NAME;\n}\n'],
  ['a parameter', 'export function readPath(NAME: string): string {\n  return NAME;\n}\n'],
  [
    'a parameter with a default',
    "export function readPath(NAME = ''): string {\n  return NAME;\n}\n",
  ],
  [
    'a rest parameter',
    'export function readPaths(...NAME: string[]): string[] {\n  return NAME;\n}\n',
  ],
  ['an arrow parameter', 'export const paths = [1].map((NAME) => NAME);\n'],
  ['a destructured name', "const { NAME } = JSON.parse('{}');\n\nexport const value = NAME;\n"],
  ['a destructured alias', 'const { path: NAME } = { path: 1 };\n\nexport const value = NAME;\n'],
  ['a destructured rest', 'const { ...NAME } = { path: 1 };\n\nexport const value = NAME;\n'],
  ['an array element', 'const [NAME] = [1];\n\nexport const value = NAME;\n'],
  [
    'a destructured parameter',
    'export function readPath({ path: NAME }: { path: string }): string {\n  return NAME;\n}\n',
  ],
  [
    'a catch parameter',
    'export function readPath(): string {\n  try {\n    return String(globalThis);\n  } catch (NAME) {\n    return String(NAME);\n  }\n}\n',
  ],
  ['a function', 'export function NAME(): number {\n  return 1;\n}\n'],
  ['a function expression', 'export const readPath = function NAME(): number {\n  return 1;\n};\n'],
  ['a declared function', 'export declare function NAME(): number;\n'],
  ['a class', 'export class NAME {}\n'],
  ['a class expression', 'export const Paths = class NAME {};\n'],
  ['an enum', 'export enum NAME {\n  Root,\n}\n'],
  ['a namespace', 'export namespace NAME {\n  export const root = 1;\n}\n'],
  ['an object key', 'export const paths = { NAME: 1 };\n'],
  ['a quoted object key', "export const paths = { 'NAME': 1 };\n"],
  ['a computed string key', "export const paths = { ['NAME']: 1 };\n"],
  ['a computed template key', 'export const paths = { [`NAME`]: 1 };\n'],
  ['an object method', 'export const paths = {\n  NAME(): number {\n    return 1;\n  },\n};\n'],
  ['an object getter', 'export const paths = {\n  get NAME(): number {\n    return 1;\n  },\n};\n'],
  ['a class property', 'export class Paths {\n  NAME = 1;\n}\n'],
  ['a quoted class property', "export class Paths {\n  'NAME' = 1;\n}\n"],
  ['a static class property', 'export class Paths {\n  static NAME = 1;\n}\n'],
  ['an interface property', 'export interface Paths {\n  NAME: string;\n}\n'],
  ['a quoted interface property', "export interface Paths {\n  'NAME': string;\n}\n"],
  ['a type literal property', 'export type Paths = {\n  NAME: string;\n};\n'],
  ['an index signature parameter', 'export interface Paths {\n  [NAME: string]: number;\n}\n'],
  ['an accessor property', 'export class Paths {\n  accessor NAME = 1;\n}\n'],
  ['an abstract property', 'export abstract class Paths {\n  abstract NAME: string;\n}\n'],
  [
    'an abstract accessor property',
    'export abstract class Paths {\n  abstract accessor NAME: string;\n}\n',
  ],
  ['a parameter property', 'export class Reader {\n  constructor(public NAME: string) {}\n}\n'],
  ['a class method', 'export class Paths {\n  NAME(): number {\n    return 1;\n  }\n}\n'],
  ['a quoted class method', "export class Paths {\n  'NAME'(): number {\n    return 1;\n  }\n}\n"],
  ['an abstract method', 'export abstract class Paths {\n  abstract NAME(): number;\n}\n'],
  ['an interface method', 'export interface Paths {\n  NAME(): number;\n}\n'],
  ['a function type parameter', 'export type Reader = (NAME: string) => string;\n'],
  ['a constructor type parameter', 'export type MakeReader = new (NAME: string) => object;\n'],
  [
    'a method signature parameter',
    'export interface Reader {\n  readPath(NAME: string): string;\n}\n',
  ],
  ['a call signature parameter', 'export interface Reader {\n  (NAME: string): string;\n}\n'],
  [
    'a construct signature parameter',
    'export interface MakeReader {\n  new (NAME: string): object;\n}\n',
  ],
  ['a declared function parameter', 'export declare function readPath(NAME: string): string;\n'],
  [
    'an abstract method parameter',
    'export abstract class Reader {\n  abstract readPath(NAME: string): string;\n}\n',
  ],
  [
    'an overload parameter',
    'export class Reader {\n  readPath(NAME: string): string;\n  readPath(path: string): string {\n    return path;\n  }\n}\n',
  ],
  ['a getter', 'export class Paths {\n  get NAME(): number {\n    return 1;\n  }\n}\n'],
  ['a quoted getter', "export class Paths {\n  get 'NAME'(): number {\n    return 1;\n  }\n}\n"],
  [
    'a setter',
    'export class Paths {\n  set NAME(value: number) {\n    globalThis.value = value;\n  }\n}\n',
  ],
  ['an abstract getter', 'export abstract class Paths {\n  abstract get NAME(): number;\n}\n'],
  ['an abstract setter', 'export abstract class Paths {\n  abstract set NAME(value: number);\n}\n'],
  ['an interface getter', 'export interface Paths {\n  get NAME(): number;\n}\n'],
  ['an interface setter', 'export interface Paths {\n  set NAME(value: number);\n}\n'],
  ['an enum member', 'export enum Paths {\n  NAME,\n}\n'],
  ['a quoted enum member', "export enum Paths {\n  'NAME',\n}\n"],
  [
    'a named import alias',
    "import { readFile as NAME } from 'node:fs';\n\nexport const value = NAME;\n",
  ],
  ['a default import', "import NAME from 'node:fs';\n\nexport const value = NAME;\n"],
  ['a namespace import', "import * as NAME from 'node:fs';\n\nexport const value = NAME;\n"],
  ['a require import', "import NAME = require('node:fs');\n\nexport const value = NAME;\n"],
  [
    'a namespace alias import',
    'namespace Paths {\n  export const root = 1;\n}\n\nimport NAME = Paths.root;\n\nexport const value = NAME;\n',
  ],
  ['an export alias', 'const path = 1;\n\nexport { path as NAME };\n'],
  ['a quoted export alias', "const path = 1;\n\nexport { path as 'NAME' };\n"],
  ['a namespace re-export', "export * as NAME from 'node:fs';\n"],
  ['a member assignment', 'export const paths = { path: 1 };\n\npaths.NAME = 2;\n'],
  ['a computed member assignment', "export const paths = { path: 1 };\n\npaths['NAME'] = 2;\n"],
  [
    'a destructuring member assignment',
    'export const paths = { path: 1 };\n\n({ path: paths.NAME } = { path: 2 });\n',
  ],
  ['an array member assignment', 'export const paths = { path: 1 };\n\n[paths.NAME] = [2];\n'],
  [
    'a loop member assignment',
    'export const paths = { path: 1 };\n\nfor (paths.NAME of [2]) {\n  globalThis.value = paths;\n}\n',
  ],
] as const)('it reports an abbreviated name in %s', async (_place, template) => {
  const result = await runLint(template.replaceAll('NAME', 'src'), {
    'zgeoff/no-abbreviated-names': [
      'error',
      {
        names: Object.fromEntries([
          ['src', '`source`'],
          ['ms', 'a unit suffix'],
        ]),
      },
    ],
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Rename `src` to `source`');
});

test.each([
  ['a private field', 'export class Paths {\n  #NAME = 1;\n}\n'],
  ['a private getter', 'export class Paths {\n  get #NAME(): number {\n    return 1;\n  }\n}\n'],
  ['a private method', 'export class Paths {\n  #NAME(): number {\n    return 1;\n  }\n}\n'],
] as const)('it reports an abbreviated name in %s', async (_place, template) => {
  const result = await runLint(template.replaceAll('NAME', 'src'), {
    'zgeoff/no-abbreviated-names': [
      'error',
      {
        names: Object.fromEntries([
          ['src', '`source`'],
          ['ms', 'a unit suffix'],
        ]),
      },
    ],
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Rename `#src` to `source`');
});

test.each([
  ['a variable', 'export const NAME = 1;\n'],
  ['a loop variable', 'for (const NAME of [1]) {\n  globalThis.value = NAME;\n}\n'],
  ['a parameter', 'export function readPath(NAME: string): string {\n  return NAME;\n}\n'],
  [
    'a parameter with a default',
    "export function readPath(NAME = ''): string {\n  return NAME;\n}\n",
  ],
  [
    'a rest parameter',
    'export function readPaths(...NAME: string[]): string[] {\n  return NAME;\n}\n',
  ],
  ['an arrow parameter', 'export const paths = [1].map((NAME) => NAME);\n'],
  ['a destructured name', "const { NAME } = JSON.parse('{}');\n\nexport const value = NAME;\n"],
  ['a destructured alias', 'const { path: NAME } = { path: 1 };\n\nexport const value = NAME;\n'],
  ['a destructured rest', 'const { ...NAME } = { path: 1 };\n\nexport const value = NAME;\n'],
  ['an array element', 'const [NAME] = [1];\n\nexport const value = NAME;\n'],
  [
    'a destructured parameter',
    'export function readPath({ path: NAME }: { path: string }): string {\n  return NAME;\n}\n',
  ],
  [
    'a catch parameter',
    'export function readPath(): string {\n  try {\n    return String(globalThis);\n  } catch (NAME) {\n    return String(NAME);\n  }\n}\n',
  ],
  ['a function', 'export function NAME(): number {\n  return 1;\n}\n'],
  ['a function expression', 'export const readPath = function NAME(): number {\n  return 1;\n};\n'],
  ['a declared function', 'export declare function NAME(): number;\n'],
  ['a class', 'export class NAME {}\n'],
  ['a class expression', 'export const Paths = class NAME {};\n'],
  ['an enum', 'export enum NAME {\n  Root,\n}\n'],
  ['a namespace', 'export namespace NAME {\n  export const root = 1;\n}\n'],
  ['an object key', 'export const paths = { NAME: 1 };\n'],
  ['a quoted object key', "export const paths = { 'NAME': 1 };\n"],
  ['a computed string key', "export const paths = { ['NAME']: 1 };\n"],
  ['a computed template key', 'export const paths = { [`NAME`]: 1 };\n'],
  ['an object method', 'export const paths = {\n  NAME(): number {\n    return 1;\n  },\n};\n'],
  ['an object getter', 'export const paths = {\n  get NAME(): number {\n    return 1;\n  },\n};\n'],
  ['a class property', 'export class Paths {\n  NAME = 1;\n}\n'],
  ['a quoted class property', "export class Paths {\n  'NAME' = 1;\n}\n"],
  ['a static class property', 'export class Paths {\n  static NAME = 1;\n}\n'],
  ['an interface property', 'export interface Paths {\n  NAME: string;\n}\n'],
  ['a quoted interface property', "export interface Paths {\n  'NAME': string;\n}\n"],
  ['a type literal property', 'export type Paths = {\n  NAME: string;\n};\n'],
  ['an index signature parameter', 'export interface Paths {\n  [NAME: string]: number;\n}\n'],
  ['an accessor property', 'export class Paths {\n  accessor NAME = 1;\n}\n'],
  ['an abstract property', 'export abstract class Paths {\n  abstract NAME: string;\n}\n'],
  [
    'an abstract accessor property',
    'export abstract class Paths {\n  abstract accessor NAME: string;\n}\n',
  ],
  ['a parameter property', 'export class Reader {\n  constructor(public NAME: string) {}\n}\n'],
  ['a class method', 'export class Paths {\n  NAME(): number {\n    return 1;\n  }\n}\n'],
  ['a quoted class method', "export class Paths {\n  'NAME'(): number {\n    return 1;\n  }\n}\n"],
  ['an abstract method', 'export abstract class Paths {\n  abstract NAME(): number;\n}\n'],
  ['an interface method', 'export interface Paths {\n  NAME(): number;\n}\n'],
  ['a function type parameter', 'export type Reader = (NAME: string) => string;\n'],
  ['a constructor type parameter', 'export type MakeReader = new (NAME: string) => object;\n'],
  [
    'a method signature parameter',
    'export interface Reader {\n  readPath(NAME: string): string;\n}\n',
  ],
  ['a call signature parameter', 'export interface Reader {\n  (NAME: string): string;\n}\n'],
  [
    'a construct signature parameter',
    'export interface MakeReader {\n  new (NAME: string): object;\n}\n',
  ],
  ['a declared function parameter', 'export declare function readPath(NAME: string): string;\n'],
  [
    'an abstract method parameter',
    'export abstract class Reader {\n  abstract readPath(NAME: string): string;\n}\n',
  ],
  [
    'an overload parameter',
    'export class Reader {\n  readPath(NAME: string): string;\n  readPath(path: string): string {\n    return path;\n  }\n}\n',
  ],
  ['a getter', 'export class Paths {\n  get NAME(): number {\n    return 1;\n  }\n}\n'],
  ['a quoted getter', "export class Paths {\n  get 'NAME'(): number {\n    return 1;\n  }\n}\n"],
  [
    'a setter',
    'export class Paths {\n  set NAME(value: number) {\n    globalThis.value = value;\n  }\n}\n',
  ],
  ['an abstract getter', 'export abstract class Paths {\n  abstract get NAME(): number;\n}\n'],
  ['an abstract setter', 'export abstract class Paths {\n  abstract set NAME(value: number);\n}\n'],
  ['an interface getter', 'export interface Paths {\n  get NAME(): number;\n}\n'],
  ['an interface setter', 'export interface Paths {\n  set NAME(value: number);\n}\n'],
  ['an enum member', 'export enum Paths {\n  NAME,\n}\n'],
  ['a quoted enum member', "export enum Paths {\n  'NAME',\n}\n"],
  [
    'a named import alias',
    "import { readFile as NAME } from 'node:fs';\n\nexport const value = NAME;\n",
  ],
  ['a default import', "import NAME from 'node:fs';\n\nexport const value = NAME;\n"],
  ['a namespace import', "import * as NAME from 'node:fs';\n\nexport const value = NAME;\n"],
  ['a require import', "import NAME = require('node:fs');\n\nexport const value = NAME;\n"],
  [
    'a namespace alias import',
    'namespace Paths {\n  export const root = 1;\n}\n\nimport NAME = Paths.root;\n\nexport const value = NAME;\n',
  ],
  ['an export alias', 'const path = 1;\n\nexport { path as NAME };\n'],
  ['a quoted export alias', "const path = 1;\n\nexport { path as 'NAME' };\n"],
  ['a namespace re-export', "export * as NAME from 'node:fs';\n"],
  ['a member assignment', 'export const paths = { path: 1 };\n\npaths.NAME = 2;\n'],
  ['a computed member assignment', "export const paths = { path: 1 };\n\npaths['NAME'] = 2;\n"],
  [
    'a destructuring member assignment',
    'export const paths = { path: 1 };\n\n({ path: paths.NAME } = { path: 2 });\n',
  ],
  ['an array member assignment', 'export const paths = { path: 1 };\n\n[paths.NAME] = [2];\n'],
  [
    'a loop member assignment',
    'export const paths = { path: 1 };\n\nfor (paths.NAME of [2]) {\n  globalThis.value = paths;\n}\n',
  ],
  ['a private field', 'export class Paths {\n  #NAME = 1;\n}\n'],
  ['a private getter', 'export class Paths {\n  get #NAME(): number {\n    return 1;\n  }\n}\n'],
  ['a private method', 'export class Paths {\n  #NAME(): number {\n    return 1;\n  }\n}\n'],
])('it accepts a full name in %s', async (_place, template) => {
  const result = await runLint(template.replaceAll('NAME', 'source'), {
    'zgeoff/no-abbreviated-names': [
      'error',
      {
        names: Object.fromEntries([
          ['src', '`source`'],
          ['ms', 'a unit suffix'],
        ]),
      },
    ],
  });

  expect(result.stdout).not.toInclude('no-abbreviated-names');
});

test.each([
  [
    'a type-only import',
    "import type { Paths as src } from './paths.ts';\n\nexport type Value = src;\n",
  ],
  [
    'a type-only specifier',
    "import { type Paths as src } from './paths.ts';\n\nexport type Value = src;\n",
  ],
  [
    'a type-only default import',
    "import type src from './paths.ts';\n\nexport type Value = src;\n",
  ],
  [
    'a type-only require import',
    "import type src = require('./paths.ts');\n\nexport type Value = src;\n",
  ],
  [
    'a type-only export',
    "import type { Paths } from './paths.ts';\n\nexport type { Paths as src };\n",
  ],
  [
    'a type-only export specifier',
    "import type { Paths } from './paths.ts';\n\nexport { type Paths as src };\n",
  ],
  ['a type-only re-export', "export type * as src from './paths.ts';\n"],
  ['a computed key that reads a variable', 'export const paths = { [src]: 1 };\n'],
  [
    'a computed member that reads a variable',
    'export const paths = { path: 1 };\n\npaths[src] = 2;\n',
  ],
  [
    'a destructured key in a member assignment',
    "export const paths = { path: 1 };\n\n({ src: paths.path } = JSON.parse('{}'));\n",
  ],
  ['a quoted module name', "declare module 'src' {\n  export const root: number;\n}\n"],
  ['a type alias', 'export type src = string;\n'],
  ['a type parameter', 'export type Paths<src> = src[];\n'],
  ['a label', 'src: for (const path of [1]) {\n  globalThis.value = path;\n  break src;\n}\n'],
])('it accepts an abbreviated name in %s', async (_place, source) => {
  const result = await runLint(source, {
    'zgeoff/no-abbreviated-names': [
      'error',
      {
        names: Object.fromEntries([
          ['src', '`source`'],
          ['ms', 'a unit suffix'],
        ]),
      },
    ],
  });

  expect(result.stdout).not.toInclude('no-abbreviated-names');
});

test('it accepts an abbreviation inside a longer name', async () => {
  const source = 'export const timeoutMs = 1;\nexport const srcPath = 2;\n';

  const result = await runLint(source, {
    'zgeoff/no-abbreviated-names': [
      'error',
      {
        names: Object.fromEntries([
          ['src', '`source`'],
          ['ms', 'a unit suffix'],
        ]),
      },
    ],
  });

  expect(result.exitCode).toBe(0);
});

test('it accepts a destructured key that an alias renames', async () => {
  const source =
    'const { src: source } = Object.fromEntries([["src", 1]]);\n\nexport const value = source;\n';

  const result = await runLint(source, {
    'zgeoff/no-abbreviated-names': [
      'error',
      {
        names: Object.fromEntries([
          ['src', '`source`'],
          ['ms', 'a unit suffix'],
        ]),
      },
    ],
  });

  expect(result.exitCode).toBe(0);
});

test('it accepts an abbreviated name read from another object', async () => {
  const source =
    'const paths = { source: 1 };\n\nexport const value = Reflect.get(paths, "src") ?? process.src;\n';

  const result = await runLint(source, {
    'zgeoff/no-abbreviated-names': [
      'error',
      {
        names: Object.fromEntries([
          ['src', '`source`'],
          ['ms', 'a unit suffix'],
        ]),
      },
    ],
  });

  expect(result.exitCode).toBe(0);
});

test('it reports nothing when the config names no abbreviations', async () => {
  const result = await runLint('export const src = 1;\n', {
    'zgeoff/no-abbreviated-names': 'error',
  });

  expect(result.exitCode).toBe(0);
});

test('it flags an import across a forbidden edge', async () => {
  const result = await runLintTree(
    {
      'src/config/read-config.ts': "import { run } from '../../scripts/run';\n\nrun();\n",
      'scripts/run.ts': 'export function run(): void {}\n',
    },
    'src/config/read-config.ts',
    {
      'zgeoff/import-zones': [
        'error',
        {
          zones: {
            core: ['src/**'],
            support: ['src/{config,state}/**'],
            stage: ['src/{judge,rules}/**'],
            network: ['src/model/**'],
            tooling: ['scripts/**'],
          },
          edges: [
            { name: 'core-no-tooling', from: ['core'], to: ['tooling'] },
            {
              name: 'support',
              from: ['support'],
              allow: ['support'],
              allowTypeOnly: ['**/types.ts'],
              reason: 'support modules sit below the stages',
            },
            { name: 'stages', from: ['stage'], allow: ['support'], allowWithin: 'src/*' },
          ],
          modules: [
            {
              name: 'network',
              modules: ['node:https', 'node:http'],
              from: ['core'],
              allow: ['network'],
              allowTypeOnly: true,
            },
          ],
          globals: [{ name: 'network', globals: ['fetch'], from: ['core'], allow: ['network'] }],
          unzoned: [
            {
              name: 'zone-assignment',
              from: ['core'],
              zones: ['support', 'stage', 'network'],
              ignore: ['**/*.test.ts'],
            },
          ],
          unresolved: [{ name: 'unresolved', from: ['core'] }],
        },
      ],
    },
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('import-zones');
  expect(result.stdout).toInclude('core-no-tooling: core must not import scripts/run.ts (tooling)');
});

test('it accepts an import the zones allow', async () => {
  const result = await runLintTree(
    {
      'src/judge/run-judge.ts':
        "import { readState } from '../state/read-state';\nimport { split } from './split';\n\nreadState(split());\n",
      'src/state/read-state.ts': 'export function readState(): void {}\n',
      'src/judge/split.ts': 'export function split(): void {}\n',
    },
    'src/judge/run-judge.ts',
    {
      'zgeoff/import-zones': [
        'error',
        {
          zones: {
            core: ['src/**'],
            support: ['src/{config,state}/**'],
            stage: ['src/{judge,rules}/**'],
            network: ['src/model/**'],
            tooling: ['scripts/**'],
          },
          edges: [
            { name: 'core-no-tooling', from: ['core'], to: ['tooling'] },
            {
              name: 'support',
              from: ['support'],
              allow: ['support'],
              allowTypeOnly: ['**/types.ts'],
              reason: 'support modules sit below the stages',
            },
            { name: 'stages', from: ['stage'], allow: ['support'], allowWithin: 'src/*' },
          ],
          modules: [
            {
              name: 'network',
              modules: ['node:https', 'node:http'],
              from: ['core'],
              allow: ['network'],
              allowTypeOnly: true,
            },
          ],
          globals: [{ name: 'network', globals: ['fetch'], from: ['core'], allow: ['network'] }],
          unzoned: [
            {
              name: 'zone-assignment',
              from: ['core'],
              zones: ['support', 'stage', 'network'],
              ignore: ['**/*.test.ts'],
            },
          ],
          unresolved: [{ name: 'unresolved', from: ['core'] }],
        },
      ],
    },
  );

  expect(result.exitCode).toBe(0);
});

test('it flags an import into a zone outside the allow list, with the reason', async () => {
  const result = await runLintTree(
    {
      'src/config/read-config.ts': "import { judge } from '../judge/judge.ts';\n\njudge();\n",
      'src/judge/judge.ts': 'export function judge(): void {}\n',
    },
    'src/config/read-config.ts',
    {
      'zgeoff/import-zones': [
        'error',
        {
          zones: {
            core: ['src/**'],
            support: ['src/{config,state}/**'],
            stage: ['src/{judge,rules}/**'],
            network: ['src/model/**'],
            tooling: ['scripts/**'],
          },
          edges: [
            { name: 'core-no-tooling', from: ['core'], to: ['tooling'] },
            {
              name: 'support',
              from: ['support'],
              allow: ['support'],
              allowTypeOnly: ['**/types.ts'],
              reason: 'support modules sit below the stages',
            },
            { name: 'stages', from: ['stage'], allow: ['support'], allowWithin: 'src/*' },
          ],
          modules: [
            {
              name: 'network',
              modules: ['node:https', 'node:http'],
              from: ['core'],
              allow: ['network'],
              allowTypeOnly: true,
            },
          ],
          globals: [{ name: 'network', globals: ['fetch'], from: ['core'], allow: ['network'] }],
          unzoned: [
            {
              name: 'zone-assignment',
              from: ['core'],
              zones: ['support', 'stage', 'network'],
              ignore: ['**/*.test.ts'],
            },
          ],
          unresolved: [{ name: 'unresolved', from: ['core'] }],
        },
      ],
    },
  );

  expect(result.exitCode).toBe(1);

  expect(result.stdout).toInclude(
    'support: support must not import src/judge/judge.ts (core, stage) — support modules sit below the stages',
  );
});

test('it flags a stage that imports another stage but not its own folder', async () => {
  const files = {
    'src/judge/run-judge.ts': "import { split } from '../rules/split';\n\nsplit();\n",
    'src/rules/split.ts': 'export function split(): void {}\n',
  };

  const result = await runLintTree(files, 'src/judge/run-judge.ts', {
    'zgeoff/import-zones': [
      'error',
      {
        zones: {
          core: ['src/**'],
          support: ['src/{config,state}/**'],
          stage: ['src/{judge,rules}/**'],
          network: ['src/model/**'],
          tooling: ['scripts/**'],
        },
        edges: [
          { name: 'core-no-tooling', from: ['core'], to: ['tooling'] },
          {
            name: 'support',
            from: ['support'],
            allow: ['support'],
            allowTypeOnly: ['**/types.ts'],
            reason: 'support modules sit below the stages',
          },
          { name: 'stages', from: ['stage'], allow: ['support'], allowWithin: 'src/*' },
        ],
        modules: [
          {
            name: 'network',
            modules: ['node:https', 'node:http'],
            from: ['core'],
            allow: ['network'],
            allowTypeOnly: true,
          },
        ],
        globals: [{ name: 'network', globals: ['fetch'], from: ['core'], allow: ['network'] }],
        unzoned: [
          {
            name: 'zone-assignment',
            from: ['core'],
            zones: ['support', 'stage', 'network'],
            ignore: ['**/*.test.ts'],
          },
        ],
        unresolved: [{ name: 'unresolved', from: ['core'] }],
      },
    ],
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('stages: stage must not import src/rules/split.ts (core, stage)');
});

test('it accepts a type-only import where the edge allows one', async () => {
  const files = {
    'src/config/read-config.ts':
      "import type { Verdict } from '../judge/types';\n\nexport const verdict: Verdict = 'allow';\n",
    'src/judge/types.ts': "export type Verdict = 'allow' | 'deny';\n",
  };

  const result = await runLintTree(files, 'src/config/read-config.ts', {
    'zgeoff/import-zones': [
      'error',
      {
        zones: {
          core: ['src/**'],
          support: ['src/{config,state}/**'],
          stage: ['src/{judge,rules}/**'],
          network: ['src/model/**'],
          tooling: ['scripts/**'],
        },
        edges: [
          { name: 'core-no-tooling', from: ['core'], to: ['tooling'] },
          {
            name: 'support',
            from: ['support'],
            allow: ['support'],
            allowTypeOnly: ['**/types.ts'],
            reason: 'support modules sit below the stages',
          },
          { name: 'stages', from: ['stage'], allow: ['support'], allowWithin: 'src/*' },
        ],
        modules: [
          {
            name: 'network',
            modules: ['node:https', 'node:http'],
            from: ['core'],
            allow: ['network'],
            allowTypeOnly: true,
          },
        ],
        globals: [{ name: 'network', globals: ['fetch'], from: ['core'], allow: ['network'] }],
        unzoned: [
          {
            name: 'zone-assignment',
            from: ['core'],
            zones: ['support', 'stage', 'network'],
            ignore: ['**/*.test.ts'],
          },
        ],
        unresolved: [{ name: 'unresolved', from: ['core'] }],
      },
    ],
  });

  expect(result.exitCode).toBe(0);
});

test('it flags a type-only import of a file the edge does not exempt', async () => {
  const files = {
    'src/config/read-config.ts':
      "import { type Verdict } from '../judge/judge';\n\nexport const verdict: Verdict = 'allow';\n",
    'src/judge/judge.ts': "export type Verdict = 'allow' | 'deny';\n",
  };

  const result = await runLintTree(files, 'src/config/read-config.ts', {
    'zgeoff/import-zones': [
      'error',
      {
        zones: {
          core: ['src/**'],
          support: ['src/{config,state}/**'],
          stage: ['src/{judge,rules}/**'],
          network: ['src/model/**'],
          tooling: ['scripts/**'],
        },
        edges: [
          { name: 'core-no-tooling', from: ['core'], to: ['tooling'] },
          {
            name: 'support',
            from: ['support'],
            allow: ['support'],
            allowTypeOnly: ['**/types.ts'],
            reason: 'support modules sit below the stages',
          },
          { name: 'stages', from: ['stage'], allow: ['support'], allowWithin: 'src/*' },
        ],
        modules: [
          {
            name: 'network',
            modules: ['node:https', 'node:http'],
            from: ['core'],
            allow: ['network'],
            allowTypeOnly: true,
          },
        ],
        globals: [{ name: 'network', globals: ['fetch'], from: ['core'], allow: ['network'] }],
        unzoned: [
          {
            name: 'zone-assignment',
            from: ['core'],
            zones: ['support', 'stage', 'network'],
            ignore: ['**/*.test.ts'],
          },
        ],
        unresolved: [{ name: 'unresolved', from: ['core'] }],
      },
    ],
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('support: support must not import src/judge/judge.ts');
});

test('it judges re-exports, dynamic imports, require calls and import types', async () => {
  const source = [
    "export { run } from '../../scripts/run';",
    "export * from '../../scripts/run';",
    "await import('../../scripts/run');",
    'require(`../../scripts/run`);',
    "import.meta.require('../../scripts/run');",
    "export type Run = import('../../scripts/run').Run;",
    '',
  ].join('\n');

  const files = {
    'src/model/send.ts': source,
    'scripts/run.ts': 'export type Run = () => void;\nexport function run(): void {}\n',
  };

  const result = await runLintTree(files, 'src/model/send.ts', {
    'zgeoff/import-zones': [
      'error',
      {
        zones: {
          core: ['src/**'],
          support: ['src/{config,state}/**'],
          stage: ['src/{judge,rules}/**'],
          network: ['src/model/**'],
          tooling: ['scripts/**'],
        },
        edges: [
          { name: 'core-no-tooling', from: ['core'], to: ['tooling'] },
          {
            name: 'support',
            from: ['support'],
            allow: ['support'],
            allowTypeOnly: ['**/types.ts'],
            reason: 'support modules sit below the stages',
          },
          { name: 'stages', from: ['stage'], allow: ['support'], allowWithin: 'src/*' },
        ],
        modules: [
          {
            name: 'network',
            modules: ['node:https', 'node:http'],
            from: ['core'],
            allow: ['network'],
            allowTypeOnly: true,
          },
        ],
        globals: [{ name: 'network', globals: ['fetch'], from: ['core'], allow: ['network'] }],
        unzoned: [
          {
            name: 'zone-assignment',
            from: ['core'],
            zones: ['support', 'stage', 'network'],
            ignore: ['**/*.test.ts'],
          },
        ],
        unresolved: [{ name: 'unresolved', from: ['core'] }],
      },
    ],
  });

  const reports = result.stdout.match(/core-no-tooling: /gu) ?? [];

  expect(result.exitCode).toBe(1);
  expect(reports).toHaveLength(6);
});

test('it flags a computed import.meta.require call and import.meta.require used as a value', async () => {
  const files = {
    'src/state/load.ts': [
      "const name = process.argv[2] ?? 'run';",
      'import.meta.require(name);',
      'const load = import.meta.require;',
      'load(name);',
      '',
    ].join('\n'),
  };

  const result = await runLintTree(files, 'src/state/load.ts', {
    'zgeoff/import-zones': [
      'error',
      {
        zones: {
          core: ['src/**'],
          support: ['src/{config,state}/**'],
          stage: ['src/{judge,rules}/**'],
          network: ['src/model/**'],
          tooling: ['scripts/**'],
        },
        edges: [
          { name: 'core-no-tooling', from: ['core'], to: ['tooling'] },
          {
            name: 'support',
            from: ['support'],
            allow: ['support'],
            allowTypeOnly: ['**/types.ts'],
            reason: 'support modules sit below the stages',
          },
          { name: 'stages', from: ['stage'], allow: ['support'], allowWithin: 'src/*' },
        ],
        modules: [
          {
            name: 'network',
            modules: ['node:https', 'node:http'],
            from: ['core'],
            allow: ['network'],
            allowTypeOnly: true,
          },
        ],
        globals: [{ name: 'network', globals: ['fetch'], from: ['core'], allow: ['network'] }],
        unzoned: [
          {
            name: 'zone-assignment',
            from: ['core'],
            zones: ['support', 'stage', 'network'],
            ignore: ['**/*.test.ts'],
          },
        ],
        unresolved: [{ name: 'unresolved', from: ['core'] }],
      },
    ],
  });

  const reports = result.stdout.match(/unresolved: cannot check a computed import specifier/gu);

  expect(result.exitCode).toBe(1);
  expect(reports).toHaveLength(2);
});

test('it flags a restricted module outside its zones', async () => {
  const files = {
    'src/state/send.ts': "import { request } from 'node:https';\n\nrequest('https://x.test');\n",
  };

  const result = await runLintTree(files, 'src/state/send.ts', {
    'zgeoff/import-zones': [
      'error',
      {
        zones: {
          core: ['src/**'],
          support: ['src/{config,state}/**'],
          stage: ['src/{judge,rules}/**'],
          network: ['src/model/**'],
          tooling: ['scripts/**'],
        },
        edges: [
          { name: 'core-no-tooling', from: ['core'], to: ['tooling'] },
          {
            name: 'support',
            from: ['support'],
            allow: ['support'],
            allowTypeOnly: ['**/types.ts'],
            reason: 'support modules sit below the stages',
          },
          { name: 'stages', from: ['stage'], allow: ['support'], allowWithin: 'src/*' },
        ],
        modules: [
          {
            name: 'network',
            modules: ['node:https', 'node:http'],
            from: ['core'],
            allow: ['network'],
            allowTypeOnly: true,
          },
        ],
        globals: [{ name: 'network', globals: ['fetch'], from: ['core'], allow: ['network'] }],
        unzoned: [
          {
            name: 'zone-assignment',
            from: ['core'],
            zones: ['support', 'stage', 'network'],
            ignore: ['**/*.test.ts'],
          },
        ],
        unresolved: [{ name: 'unresolved', from: ['core'] }],
      },
    ],
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('network: node:https is allowed only in network');
});

test('it restricts every module that a name ending in * prefixes, and node:* every builtin', async () => {
  const source = [
    "import { readFile } from 'node:fs';",
    "import { join } from 'path';",
    "import { Database } from 'bun:sqlite';",
    "import { shared } from '@scope/shared';",
    "import { other } from '@scopes/other';",
    '',
  ].join('\n');

  const rules = {
    'zgeoff/import-zones': [
      'error',
      {
        zones: { core: ['src/**'] },
        modules: [{ name: 'neutral', modules: ['node:*', '@scope/*'], allow: [] }],
      },
    ],
  };

  const result = await runLintTree({ 'src/read.ts': source }, 'src/read.ts', rules);

  const reports = result.stdout.match(/neutral: \S+ is allowed only in no zone/gu);

  expect(result.exitCode).toBe(1);

  expect(reports).toStrictEqual([
    'neutral: node:fs is allowed only in no zone',
    'neutral: path is allowed only in no zone',
    'neutral: @scope/shared is allowed only in no zone',
  ]);
});

test('it accepts a restricted module inside its zone, out of scope, or imported for types', async () => {
  const files = {
    'src/model/send.ts': "import { request } from 'https';\n\nrequest('https://x.test');\n",
    'src/state/agent.ts':
      "import type { Agent } from 'node:https';\n\nexport const agents: Agent[] = [];\n",
    'scripts/send.ts': "import { request } from 'node:https';\n\nrequest('https://x.test');\n",
  };

  const directory = await createLintTree(files, {
    'zgeoff/import-zones': [
      'error',
      {
        zones: {
          core: ['src/**'],
          support: ['src/{config,state}/**'],
          stage: ['src/{judge,rules}/**'],
          network: ['src/model/**'],
          tooling: ['scripts/**'],
        },
        edges: [
          { name: 'core-no-tooling', from: ['core'], to: ['tooling'] },
          {
            name: 'support',
            from: ['support'],
            allow: ['support'],
            allowTypeOnly: ['**/types.ts'],
            reason: 'support modules sit below the stages',
          },
          { name: 'stages', from: ['stage'], allow: ['support'], allowWithin: 'src/*' },
        ],
        modules: [
          {
            name: 'network',
            modules: ['node:https', 'node:http'],
            from: ['core'],
            allow: ['network'],
            allowTypeOnly: true,
          },
        ],
        globals: [{ name: 'network', globals: ['fetch'], from: ['core'], allow: ['network'] }],
        unzoned: [
          {
            name: 'zone-assignment',
            from: ['core'],
            zones: ['support', 'stage', 'network'],
            ignore: ['**/*.test.ts'],
          },
        ],
        unresolved: [{ name: 'unresolved', from: ['core'] }],
      },
    ],
  });

  const results = await Promise.all(
    ['src/model/send.ts', 'src/state/agent.ts', 'scripts/send.ts'].map((target: string) =>
      runLintIn(directory, directory, target),
    ),
  );

  expect(results.map((result: OxlintRun) => result.exitCode)).toStrictEqual([0, 0, 0]);
});

test('it flags a restricted global call outside its zones', async () => {
  const files = {
    'src/state/send.ts':
      "await fetch('https://x.test');\nawait globalThis.fetch('https://x.test');\n",
    'src/model/send.ts': "await fetch('https://x.test');\n",
  };

  const directory = await createLintTree(files, {
    'zgeoff/import-zones': [
      'error',
      {
        zones: {
          core: ['src/**'],
          support: ['src/{config,state}/**'],
          stage: ['src/{judge,rules}/**'],
          network: ['src/model/**'],
          tooling: ['scripts/**'],
        },
        edges: [
          { name: 'core-no-tooling', from: ['core'], to: ['tooling'] },
          {
            name: 'support',
            from: ['support'],
            allow: ['support'],
            allowTypeOnly: ['**/types.ts'],
            reason: 'support modules sit below the stages',
          },
          { name: 'stages', from: ['stage'], allow: ['support'], allowWithin: 'src/*' },
        ],
        modules: [
          {
            name: 'network',
            modules: ['node:https', 'node:http'],
            from: ['core'],
            allow: ['network'],
            allowTypeOnly: true,
          },
        ],
        globals: [{ name: 'network', globals: ['fetch'], from: ['core'], allow: ['network'] }],
        unzoned: [
          {
            name: 'zone-assignment',
            from: ['core'],
            zones: ['support', 'stage', 'network'],
            ignore: ['**/*.test.ts'],
          },
        ],
        unresolved: [{ name: 'unresolved', from: ['core'] }],
      },
    ],
  });

  const outside = await runLintIn(directory, directory, 'src/state/send.ts');
  const inside = await runLintIn(directory, directory, 'src/model/send.ts');

  expect(outside.exitCode).toBe(1);
  expect(outside.stdout.match(/network: fetch\(\) is allowed only in network/gu)).toHaveLength(2);
  expect(inside.exitCode).toBe(0);
});

test('it flags a file that belongs to none of the required zones, unless ignored', async () => {
  const files = {
    'src/stray/run.ts': 'export const answer = 42;\n',
    'src/stray/run.test.ts': 'export const answer = 42;\n',
  };

  const directory = await createLintTree(files, {
    'zgeoff/import-zones': [
      'error',
      {
        zones: {
          core: ['src/**'],
          support: ['src/{config,state}/**'],
          stage: ['src/{judge,rules}/**'],
          network: ['src/model/**'],
          tooling: ['scripts/**'],
        },
        edges: [
          { name: 'core-no-tooling', from: ['core'], to: ['tooling'] },
          {
            name: 'support',
            from: ['support'],
            allow: ['support'],
            allowTypeOnly: ['**/types.ts'],
            reason: 'support modules sit below the stages',
          },
          { name: 'stages', from: ['stage'], allow: ['support'], allowWithin: 'src/*' },
        ],
        modules: [
          {
            name: 'network',
            modules: ['node:https', 'node:http'],
            from: ['core'],
            allow: ['network'],
            allowTypeOnly: true,
          },
        ],
        globals: [{ name: 'network', globals: ['fetch'], from: ['core'], allow: ['network'] }],
        unzoned: [
          {
            name: 'zone-assignment',
            from: ['core'],
            zones: ['support', 'stage', 'network'],
            ignore: ['**/*.test.ts'],
          },
        ],
        unresolved: [{ name: 'unresolved', from: ['core'] }],
      },
    ],
  });

  const stray = await runLintIn(directory, directory, 'src/stray/run.ts');
  const ignored = await runLintIn(directory, directory, 'src/stray/run.test.ts');

  expect(stray.exitCode).toBe(1);

  expect(stray.stdout).toInclude(
    'zone-assignment: this file belongs to none of support, stage, network',
  );

  expect(ignored.exitCode).toBe(0);
});

test('it flags an unresolved relative import and a computed specifier', async () => {
  const files = {
    'src/state/read.ts': "import { gone } from './gone';\n\nawait import(gone);\n",
  };

  const result = await runLintTree(files, 'src/state/read.ts', {
    'zgeoff/import-zones': [
      'error',
      {
        zones: {
          core: ['src/**'],
          support: ['src/{config,state}/**'],
          stage: ['src/{judge,rules}/**'],
          network: ['src/model/**'],
          tooling: ['scripts/**'],
        },
        edges: [
          { name: 'core-no-tooling', from: ['core'], to: ['tooling'] },
          {
            name: 'support',
            from: ['support'],
            allow: ['support'],
            allowTypeOnly: ['**/types.ts'],
            reason: 'support modules sit below the stages',
          },
          { name: 'stages', from: ['stage'], allow: ['support'], allowWithin: 'src/*' },
        ],
        modules: [
          {
            name: 'network',
            modules: ['node:https', 'node:http'],
            from: ['core'],
            allow: ['network'],
            allowTypeOnly: true,
          },
        ],
        globals: [{ name: 'network', globals: ['fetch'], from: ['core'], allow: ['network'] }],
        unzoned: [
          {
            name: 'zone-assignment',
            from: ['core'],
            zones: ['support', 'stage', 'network'],
            ignore: ['**/*.test.ts'],
          },
        ],
        unresolved: [{ name: 'unresolved', from: ['core'] }],
      },
    ],
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('unresolved: cannot resolve ./gone');
  expect(result.stdout).toInclude('unresolved: cannot check a computed import specifier');
});

test('it resolves the package’s own name through its exports and conditions', async () => {
  const manifest = {
    name: 'demo',
    exports: {
      '.': { types: './dist/index.d.ts', default: './dist/index.js' },
      './internal': { 'demo-source': './scripts/run.ts', default: './dist/run.js' },
    },
  };

  const rules = {
    'zgeoff/import-zones': [
      'error',
      {
        zones: { core: ['src/**'], tooling: ['scripts/**'] },
        conditions: ['demo-source'],
        edges: [{ name: 'core-no-tooling', from: ['core'], to: ['tooling'] }],
      },
    ],
  };

  const files = {
    'package.json': JSON.stringify(manifest),
    'src/index.ts': "import { run } from 'demo/internal';\n\nrun();\n",
    'scripts/run.ts': 'export function run(): void {}\n',
  };

  const result = await runLintTree(files, 'src/index.ts', rules);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('core-no-tooling: core must not import scripts/run.ts');
});

test('it resolves a .js specifier to the .ts source beside it', async () => {
  const files = {
    'src/config/read-config.ts': "import { run } from '../../scripts/run.js';\n\nrun();\n",
    'scripts/run.ts': 'export function run(): void {}\n',
  };

  const result = await runLintTree(files, 'src/config/read-config.ts', {
    'zgeoff/import-zones': [
      'error',
      {
        zones: {
          core: ['src/**'],
          support: ['src/{config,state}/**'],
          stage: ['src/{judge,rules}/**'],
          network: ['src/model/**'],
          tooling: ['scripts/**'],
        },
        edges: [
          { name: 'core-no-tooling', from: ['core'], to: ['tooling'] },
          {
            name: 'support',
            from: ['support'],
            allow: ['support'],
            allowTypeOnly: ['**/types.ts'],
            reason: 'support modules sit below the stages',
          },
          { name: 'stages', from: ['stage'], allow: ['support'], allowWithin: 'src/*' },
        ],
        modules: [
          {
            name: 'network',
            modules: ['node:https', 'node:http'],
            from: ['core'],
            allow: ['network'],
            allowTypeOnly: true,
          },
        ],
        globals: [{ name: 'network', globals: ['fetch'], from: ['core'], allow: ['network'] }],
        unzoned: [
          {
            name: 'zone-assignment',
            from: ['core'],
            zones: ['support', 'stage', 'network'],
            ignore: ['**/*.test.ts'],
          },
        ],
        unresolved: [{ name: 'unresolved', from: ['core'] }],
      },
    ],
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('core-no-tooling: core must not import scripts/run.ts');
});

test('it resolves a specifier with a bundler query to the file before the query', async () => {
  const files = {
    'src/config/theme.ts': "import styles from '../../scripts/styles.css?url';\n\nstyles;\n",
    'scripts/styles.css': 'body {}\n',
  };

  const result = await runLintTree(files, 'src/config/theme.ts', {
    'zgeoff/import-zones': [
      'error',
      {
        zones: {
          core: ['src/**'],
          support: ['src/{config,state}/**'],
          stage: ['src/{judge,rules}/**'],
          network: ['src/model/**'],
          tooling: ['scripts/**'],
        },
        edges: [
          { name: 'core-no-tooling', from: ['core'], to: ['tooling'] },
          {
            name: 'support',
            from: ['support'],
            allow: ['support'],
            allowTypeOnly: ['**/types.ts'],
            reason: 'support modules sit below the stages',
          },
          { name: 'stages', from: ['stage'], allow: ['support'], allowWithin: 'src/*' },
        ],
        modules: [
          {
            name: 'network',
            modules: ['node:https', 'node:http'],
            from: ['core'],
            allow: ['network'],
            allowTypeOnly: true,
          },
        ],
        globals: [{ name: 'network', globals: ['fetch'], from: ['core'], allow: ['network'] }],
        unzoned: [
          {
            name: 'zone-assignment',
            from: ['core'],
            zones: ['support', 'stage', 'network'],
            ignore: ['**/*.test.ts'],
          },
        ],
        unresolved: [{ name: 'unresolved', from: ['core'] }],
      },
    ],
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('core-no-tooling: core must not import scripts/styles.css');
});

test('it honours a next-line disable comment with a reason on a forbidden edge', async () => {
  const source = [
    '// oxlint-disable-next-line zgeoff/import-zones -- GEO-1 moves run into src/',
    "import { run } from '../../scripts/run';",
    '',
    'run();',
    '',
  ].join('\n');

  const files = {
    'src/config/read-config.ts': source,
    'scripts/run.ts': 'export function run(): void {}\n',
  };

  const result = await runLintTree(files, 'src/config/read-config.ts', {
    'zgeoff/import-zones': [
      'error',
      {
        zones: {
          core: ['src/**'],
          support: ['src/{config,state}/**'],
          stage: ['src/{judge,rules}/**'],
          network: ['src/model/**'],
          tooling: ['scripts/**'],
        },
        edges: [
          { name: 'core-no-tooling', from: ['core'], to: ['tooling'] },
          {
            name: 'support',
            from: ['support'],
            allow: ['support'],
            allowTypeOnly: ['**/types.ts'],
            reason: 'support modules sit below the stages',
          },
          { name: 'stages', from: ['stage'], allow: ['support'], allowWithin: 'src/*' },
        ],
        modules: [
          {
            name: 'network',
            modules: ['node:https', 'node:http'],
            from: ['core'],
            allow: ['network'],
            allowTypeOnly: true,
          },
        ],
        globals: [{ name: 'network', globals: ['fetch'], from: ['core'], allow: ['network'] }],
        unzoned: [
          {
            name: 'zone-assignment',
            from: ['core'],
            zones: ['support', 'stage', 'network'],
            ignore: ['**/*.test.ts'],
          },
        ],
        unresolved: [{ name: 'unresolved', from: ['core'] }],
      },
    ],
  });

  expect(result.exitCode).toBe(0);
});

test('it exempts an allow zone inside a to zone', async () => {
  const rules = {
    'zgeoff/import-zones': [
      'error',
      {
        zones: { core: ['src/**'], mods: ['mods/**'], contract: ['mods/app/contract/**'] },
        edges: [{ name: 'apart', from: ['core'], to: ['mods'], allow: ['contract'] }],
      },
    ],
  };

  const files = {
    'src/read.ts': "import { shape } from '../mods/app/contract/shape';\n\nshape();\n",
    'src/hook.ts': "import { hook } from '../mods/app/hook';\n\nhook();\n",
    'mods/app/contract/shape.ts': 'export function shape(): void {}\n',
    'mods/app/hook.ts': 'export function hook(): void {}\n',
  };

  const directory = await createLintTree(files, rules);
  const contract = await runLintIn(directory, directory, 'src/read.ts');
  const hook = await runLintIn(directory, directory, 'src/hook.ts');

  expect(contract.exitCode).toBe(0);
  expect(hook.exitCode).toBe(1);
  expect(hook.stdout).toInclude('apart: core must not import mods/app/hook.ts (mods)');
});

test('it rejects an edge with neither to nor allow', async () => {
  const rules = {
    'zgeoff/import-zones': [
      'error',
      { zones: { core: ['src/**'] }, edges: [{ name: 'empty', from: ['core'] }] },
    ],
  };

  const result = await runLintTree(
    { 'src/read.ts': 'export const a = 1;\n' },
    'src/read.ts',
    rules,
  );

  expect(result.exitCode).not.toBe(0);
  expect(result.stdout).toInclude("Options validation failed for rule 'zgeoff/import-zones'");
});

test('it resolves # imports and export patterns through the package manifest', async () => {
  const manifest = {
    name: 'demo',
    imports: { '#tools/*': './scripts/*.ts', '#parser': 'oxc-parser' },
    exports: { '.': './src/index.ts', './*': ['./scripts/*.ts'] },
  };

  const rules = {
    'zgeoff/import-zones': [
      'error',
      {
        zones: { core: ['src/**'], tooling: ['scripts/**'] },
        edges: [{ name: 'core-no-tooling', from: ['core'], to: ['tooling'] }],
        modules: [{ name: 'parser', modules: ['oxc-parser'], from: ['core'], allow: [] }],
      },
    ],
  };

  const source = [
    "import { run } from '#tools/run';",
    "import { build } from 'demo/build';",
    "import { parse } from '#parser';",
    '',
    'run(build(parse));',
    '',
  ].join('\n');

  const files = {
    'package.json': JSON.stringify(manifest),
    'src/index.ts': source,
    'scripts/run.ts': 'export function run(): void {}\n',
    'scripts/build.ts': 'export function build(): void {}\n',
  };

  const result = await runLintTree(files, 'src/index.ts', rules);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('core-no-tooling: core must not import scripts/run.ts');
  expect(result.stdout).toInclude('core-no-tooling: core must not import scripts/build.ts');
  expect(result.stdout).toInclude('parser: oxc-parser is allowed only in no zone');
});

test.each([
  ['the root entry', { '.': './src/index.ts' }, '@demo/store', 'packages/store (store)'],
  [
    'a named entry',
    { '.': './src/index.ts', './testing': './src/testing/index.ts' },
    '@demo/store/testing',
    'packages/store/testing (store, testing)',
  ],
  ['a * pattern key', { './*': './src/*.ts' }, '@demo/store/rows', 'packages/store/rows (store)'],
  [
    'a package with no exports map',
    undefined,
    '@demo/store/src/rows',
    'packages/store/src/rows (store)',
  ],
  [
    'a conditional root entry',
    { import: './src/index.ts', default: './src/index.cjs' },
    '@demo/store',
    'packages/store (store)',
  ],
])(
  'it maps a workspace import of %s to the path in the package folder',
  async (_entry, exports, specifier, target) => {
    const files = {
      'packages/store/package.json': JSON.stringify({ name: '@demo/store', exports }),
      'packages/app/src/run.ts': `import { store } from '${specifier}';\n\nexport const all = [store];\n`,
    };

    const result = await runLintTree(files, 'packages/app/src/run.ts', {
      'zgeoff/import-zones': [
        'error',
        {
          zones: {
            app: ['packages/app{,/**}'],
            store: ['packages/store{,/**}'],
            testing: ['packages/**/testing{,/**}'],
          },
          workspaces: ['packages/*'],
          edges: [
            { name: 'no-testing', from: ['app'], to: ['testing'] },
            { name: 'to-store', from: ['app'], to: ['store'] },
          ],
          modules: [{ name: 'store-module', modules: ['@demo/store'], allow: [] }],
          unresolved: [{ name: 'unresolved', from: ['app'] }],
          selfImports: [{ name: 'self', from: ['app', 'store'] }],
        },
      ],
    });

    expect(result.stdout).toInclude(`app must not import ${target}`);
    expect(result.stdout).not.toInclude('store-module');
    expect(result.stdout).not.toInclude('unresolved:');
  },
);

test.each([
  ['a subpath no key lists', { '.': './src/index.ts' }, '@demo/store/src/rows'],
  [
    'a subpath a null key blocks',
    { './*': './src/*.ts', './internal/*': null },
    '@demo/store/internal/rows',
  ],
  ['a subpath beside a string exports field', './src/index.ts', '@demo/store/rows'],
  [
    'the root of an exports map with only named entries',
    { './testing': './src/testing.ts' },
    '@demo/store',
  ],
  ['the root of an empty exports map', {}, '@demo/store'],
])('it reports a workspace import of %s as unresolved', async (_entry, exports, specifier) => {
  const files = {
    'packages/store/package.json': JSON.stringify({ name: '@demo/store', exports }),
    'packages/app/src/run.ts': `import { store } from '${specifier}';\n\nexport const all = [store];\n`,
  };

  const result = await runLintTree(files, 'packages/app/src/run.ts', {
    'zgeoff/import-zones': [
      'error',
      {
        zones: {
          app: ['packages/app{,/**}'],
          store: ['packages/store{,/**}'],
          testing: ['packages/**/testing{,/**}'],
        },
        workspaces: ['packages/*'],
        edges: [
          { name: 'no-testing', from: ['app'], to: ['testing'] },
          { name: 'to-store', from: ['app'], to: ['store'] },
        ],
        modules: [{ name: 'store-module', modules: ['@demo/store'], allow: [] }],
        unresolved: [{ name: 'unresolved', from: ['app'] }],
        selfImports: [{ name: 'self', from: ['app', 'store'] }],
      },
    ],
  });

  expect(result.stdout).toInclude(`unresolved: cannot resolve ${specifier}`);
  expect(result.stdout).not.toInclude('to-store:');
});

test('it reads a workspace glob written with a leading ./', async () => {
  const rules = {
    'zgeoff/import-zones': [
      'error',
      {
        zones: { app: ['packages/app/**'], store: ['packages/store{,/**}'] },
        workspaces: ['./packages/*'],
        edges: [{ name: 'to-store', from: ['app'], to: ['store'] }],
      },
    ],
  };

  const files = {
    'packages/store/package.json': JSON.stringify({ name: '@demo/store' }),
    'packages/app/src/run.ts':
      "import { store } from '@demo/store';\n\nexport const all = [store];\n",
  };

  const result = await runLintTree(files, 'packages/app/src/run.ts', rules);

  expect(result.stdout).toInclude('to-store: app must not import packages/store (store)');
});

test('it leaves a package below the workspace glob’s depth a module', async () => {
  const files = {
    'packages/group/store/package.json': JSON.stringify({ name: '@demo/store' }),
    'packages/app/src/run.ts':
      "import { store } from '@demo/store';\n\nexport const all = [store];\n",
  };

  const result = await runLintTree(files, 'packages/app/src/run.ts', {
    'zgeoff/import-zones': [
      'error',
      {
        zones: {
          app: ['packages/app{,/**}'],
          store: ['packages/store{,/**}'],
          testing: ['packages/**/testing{,/**}'],
        },
        workspaces: ['packages/*'],
        edges: [
          { name: 'no-testing', from: ['app'], to: ['testing'] },
          { name: 'to-store', from: ['app'], to: ['store'] },
        ],
        modules: [{ name: 'store-module', modules: ['@demo/store'], allow: [] }],
        unresolved: [{ name: 'unresolved', from: ['app'] }],
        selfImports: [{ name: 'self', from: ['app', 'store'] }],
      },
    ],
  });

  expect(result.stdout).toInclude('store-module: @demo/store is allowed only in no zone');
});

test('it keeps a builtin a module when a workspace package shares its name', async () => {
  const rules = {
    'zgeoff/import-zones': [
      'error',
      {
        zones: { app: ['packages/app/**'] },
        workspaces: ['packages/*'],
        modules: [{ name: 'neutral', modules: ['node:*'], from: ['app'], allow: [] }],
        unresolved: [{ name: 'unresolved', from: ['app'] }],
      },
    ],
  };

  const files = {
    'packages/path/package.json': JSON.stringify({ name: 'path', exports: {} }),
    'packages/app/src/run.ts': "import { join } from 'path';\n\nexport const all = [join];\n",
  };

  const result = await runLintTree(files, 'packages/app/src/run.ts', rules);

  expect(result.stdout).toInclude('neutral: path is allowed only in no zone');
  expect(result.stdout).not.toInclude('unresolved:');
});

test('it keeps a builtin a module when the file’s own package shares its name', async () => {
  const rules = {
    'zgeoff/import-zones': [
      'error',
      {
        zones: { core: ['src/**'] },
        modules: [{ name: 'neutral', modules: ['node:*'], from: ['core'], allow: [] }],
        selfImports: [{ name: 'self', from: ['core'] }],
      },
    ],
  };

  const files = {
    'package.json': JSON.stringify({ name: 'path', exports: { '.': './src/index.ts' } }),
    'src/index.ts': 'export const root = 1;\n',
    'src/run.ts': "import { join } from 'path';\n\nexport const all = [join];\n",
  };

  const result = await runLintTree(files, 'src/run.ts', rules);

  expect(result.stdout).toInclude('neutral: path is allowed only in no zone');
  expect(result.stdout).not.toInclude('self:');
});

test('it keeps a builtin a module when a # import maps to its name', async () => {
  const rules = {
    'zgeoff/import-zones': [
      'error',
      {
        zones: { app: ['packages/app/**'] },
        workspaces: ['packages/*'],
        modules: [{ name: 'neutral', modules: ['node:*'], from: ['app'], allow: [] }],
        unresolved: [{ name: 'unresolved', from: ['app'] }],
      },
    ],
  };

  const files = {
    'packages/path/package.json': JSON.stringify({ name: 'path', exports: {} }),
    'packages/app/package.json': JSON.stringify({
      name: '@demo/app',
      imports: { '#path': 'path' },
    }),
    'packages/app/src/run.ts': "import { join } from '#path';\n\nexport const all = [join];\n",
  };

  const result = await runLintTree(files, 'packages/app/src/run.ts', rules);

  expect(result.stdout).toInclude('neutral: path is allowed only in no zone');
  expect(result.stdout).not.toInclude('unresolved:');
});

test('it maps a # import that names a workspace package as that name', async () => {
  const files = {
    'packages/store/package.json': JSON.stringify({
      name: '@demo/store',
      exports: { './testing': './src/testing/index.ts' },
    }),
    'packages/app/package.json': JSON.stringify({
      name: '@demo/app',
      imports: { '#store-testing': '@demo/store/testing' },
    }),
    'packages/app/src/run.ts':
      "import { fake } from '#store-testing';\n\nexport const all = [fake];\n",
  };

  const result = await runLintTree(files, 'packages/app/src/run.ts', {
    'zgeoff/import-zones': [
      'error',
      {
        zones: {
          app: ['packages/app{,/**}'],
          store: ['packages/store{,/**}'],
          testing: ['packages/**/testing{,/**}'],
        },
        workspaces: ['packages/*'],
        edges: [
          { name: 'no-testing', from: ['app'], to: ['testing'] },
          { name: 'to-store', from: ['app'], to: ['store'] },
        ],
        modules: [{ name: 'store-module', modules: ['@demo/store'], allow: [] }],
        unresolved: [{ name: 'unresolved', from: ['app'] }],
        selfImports: [{ name: 'self', from: ['app', 'store'] }],
      },
    ],
  });

  expect(result.stdout).toInclude(
    'no-testing: app must not import packages/store/testing (store, testing)',
  );
});

test('it reports no self-import for another workspace package', async () => {
  const files = {
    'packages/store/package.json': JSON.stringify({ name: '@demo/store' }),
    'packages/app/package.json': JSON.stringify({ name: '@demo/app' }),
    'packages/app/src/run.ts':
      "import { store } from '@demo/store';\n\nexport const all = [store];\n",
  };

  const result = await runLintTree(files, 'packages/app/src/run.ts', {
    'zgeoff/import-zones': [
      'error',
      {
        zones: {
          app: ['packages/app{,/**}'],
          store: ['packages/store{,/**}'],
          testing: ['packages/**/testing{,/**}'],
        },
        workspaces: ['packages/*'],
        edges: [
          { name: 'no-testing', from: ['app'], to: ['testing'] },
          { name: 'to-store', from: ['app'], to: ['store'] },
        ],
        modules: [{ name: 'store-module', modules: ['@demo/store'], allow: [] }],
        unresolved: [{ name: 'unresolved', from: ['app'] }],
        selfImports: [{ name: 'self', from: ['app', 'store'] }],
      },
    ],
  });

  expect(result.stdout).toInclude('to-store:');
  expect(result.stdout).not.toInclude('self:');
});

test('it flags an import of the file’s own package by name, and accepts a relative one', async () => {
  const rules = {
    'zgeoff/import-zones': [
      'error',
      {
        zones: { store: ['packages/store/**'] },
        workspaces: ['packages/*'],
        selfImports: [
          { name: 'self', from: ['store'], reason: 'a package imports itself by path' },
        ],
      },
    ],
  };

  const files = {
    'packages/store/package.json': JSON.stringify({
      name: '@demo/store',
      exports: { '.': './src/index.ts' },
    }),
    'packages/store/src/index.ts': 'export const store = 1;\n',
    'packages/store/src/by-name.ts':
      "import { store } from '@demo/store';\n\nexport const all = [store];\n",
    'packages/store/src/by-path.ts':
      "import { store } from './index';\n\nexport const all = [store];\n",
  };

  const directory = await createLintTree(files, rules);
  const byName = await runLintIn(directory, directory, 'packages/store/src/by-name.ts');
  const byPath = await runLintIn(directory, directory, 'packages/store/src/by-path.ts');

  expect(byName.exitCode).toBe(1);

  expect(byName.stdout).toInclude(
    'self: @demo/store names the package this file belongs to; import it by a relative path — a package imports itself by path',
  );

  expect(byPath.exitCode).toBe(0);
});

test('it flags a # import that maps to the file’s own package name', async () => {
  const rules = {
    'zgeoff/import-zones': [
      'error',
      {
        zones: { core: ['src/**'] },
        selfImports: [{ name: 'self', from: ['core'] }],
      },
    ],
  };

  const files = {
    'package.json': JSON.stringify({
      name: '@demo/store',
      exports: { '.': './src/index.ts' },
      imports: { '#self': '@demo/store' },
    }),
    'src/index.ts': 'export const store = 1;\n',
    'src/run.ts': "import { store } from '#self';\n\nexport const all = [store];\n",
  };

  const result = await runLintTree(files, 'src/run.ts', rules);

  expect(result.stdout).toInclude(
    'self: #self names the package this file belongs to; import it by a relative path',
  );
});

test('it reports an own-package subpath the exports omit as a self-import and unresolved', async () => {
  const rules = {
    'zgeoff/import-zones': [
      'error',
      {
        zones: { core: ['src/**'] },
        selfImports: [{ name: 'self', from: ['core'] }],
        unresolved: [{ name: 'unresolved', from: ['core'] }],
      },
    ],
  };

  const files = {
    'package.json': JSON.stringify({ name: '@demo/store', exports: { '.': './src/index.ts' } }),
    'src/index.ts': 'export const store = 1;\n',
    'src/run.ts': "import { hidden } from '@demo/store/private';\n\nexport const all = [hidden];\n",
  };

  const result = await runLintTree(files, 'src/run.ts', rules);

  expect(result.stdout).toInclude(
    'self: @demo/store/private names the package this file belongs to; import it by a relative path',
  );

  expect(result.stdout).toInclude('unresolved: cannot resolve @demo/store/private');
});

test('it accepts a call of a local binding named like a restricted global', async () => {
  const source = [
    "import { fetch } from 'undici';",
    '',
    "await fetch('https://x.test');",
    '',
    'export function send(self: { fetch: (url: string) => void }): void {',
    "  self.fetch('https://x.test');",
    '}',
    '',
  ].join('\n');

  const result = await runLintTree({ 'src/state/send.ts': source }, 'src/state/send.ts', {
    'zgeoff/import-zones': [
      'error',
      {
        zones: {
          core: ['src/**'],
          support: ['src/{config,state}/**'],
          stage: ['src/{judge,rules}/**'],
          network: ['src/model/**'],
          tooling: ['scripts/**'],
        },
        edges: [
          { name: 'core-no-tooling', from: ['core'], to: ['tooling'] },
          {
            name: 'support',
            from: ['support'],
            allow: ['support'],
            allowTypeOnly: ['**/types.ts'],
            reason: 'support modules sit below the stages',
          },
          { name: 'stages', from: ['stage'], allow: ['support'], allowWithin: 'src/*' },
        ],
        modules: [
          {
            name: 'network',
            modules: ['node:https', 'node:http'],
            from: ['core'],
            allow: ['network'],
            allowTypeOnly: true,
          },
        ],
        globals: [{ name: 'network', globals: ['fetch'], from: ['core'], allow: ['network'] }],
        unzoned: [
          {
            name: 'zone-assignment',
            from: ['core'],
            zones: ['support', 'stage', 'network'],
            ignore: ['**/*.test.ts'],
          },
        ],
        unresolved: [{ name: 'unresolved', from: ['core'] }],
      },
    ],
  });

  expect(result.exitCode).toBe(0);
});

test('it picks the longer export pattern when two share a prefix', async () => {
  const manifest = { name: 'demo', exports: { './*': './src/*.ts', './*.js': './scripts/*.ts' } };

  const rules = {
    'zgeoff/import-zones': [
      'error',
      {
        zones: { core: ['src/**'], tooling: ['scripts/**'] },
        edges: [{ name: 'core-no-tooling', from: ['core'], to: ['tooling'] }],
      },
    ],
  };

  const files = {
    'package.json': JSON.stringify(manifest),
    'src/index.ts': "import { run } from 'demo/run.js';\n\nrun();\n",
    'scripts/run.ts': 'export function run(): void {}\n',
  };

  const result = await runLintTree(files, 'src/index.ts', rules);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('core-no-tooling: core must not import scripts/run.ts');
});

test('it reports a repo config that sets a comment rule', async () => {
  const rules = { 'zgeoff/no-comment-rule-override': 'error', 'zgeoff/no-jsdoc': 'off' };
  const files = { '.git': 'gitdir: elsewhere\n', 'sample.ts': 'export const value = 1;\n' };

  const result = await runLintTree(files, 'sample.ts', rules);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('.oxlintrc.json sets zgeoff/no-jsdoc');
});

test('it reports a comment rule set in a second repo config', async () => {
  const extra = '{\n  "rules": {\n    "zgeoff/max-consecutive-line-comments": "off"\n  }\n}\n';

  const files = {
    '.git': 'gitdir: elsewhere\n',
    '.oxlintrc.imports.json': extra,
    'sample.ts': 'export const value = 1;\n',
  };

  const result = await runLintTree(files, 'sample.ts', {
    'zgeoff/no-comment-rule-override': 'error',
  });

  expect(result.exitCode).toBe(1);

  expect(result.stdout).toInclude(
    '.oxlintrc.imports.json sets zgeoff/max-consecutive-line-comments',
  );
});

test.each([
  ['typescript/consistent-type-assertions'],
  ['@typescript-eslint/consistent-type-assertions'],
  ['consistent-type-assertions'],
  ['zgeoff/no-hidden-cast'],
])('it reports a repo config that sets the type-assertion rule %s', async (rule) => {
  const extra = `{\n  "overrides": [{ "files": ["*.ts"], "rules": { "${rule}": "off" } }]\n}\n`;

  const files = {
    '.git': 'gitdir: elsewhere\n',
    '.oxlintrc.casts.json': extra,
    'sample.ts': 'export const value = 1;\n',
  };

  const result = await runLintTree(files, 'sample.ts', {
    'zgeoff/no-comment-rule-override': 'error',
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude(`.oxlintrc.casts.json sets ${rule}`);
});

test('it ignores a rule whose name only ends in a locked rule name', async () => {
  const extra = '{\n  "rules": { "acme/strict-no-hidden-cast": "off" }\n}\n';

  const files = {
    '.git': 'gitdir: elsewhere\n',
    '.oxlintrc.extra.json': extra,
    'sample.ts': 'export const value = 1;\n',
  };

  const result = await runLintTree(files, 'sample.ts', {
    'zgeoff/no-comment-rule-override': 'error',
  });

  expect(result.exitCode).toBe(0);
});

test('it ignores a comment rule named only inside a config comment', async () => {
  const extra = '{\n  // "zgeoff/no-jsdoc": "off",\n  "rules": {}\n}\n';

  const files = {
    '.git': 'gitdir: elsewhere\n',
    '.oxlintrc.extra.json': extra,
    'sample.ts': 'export const value = 1;\n',
  };

  const result = await runLintTree(files, 'sample.ts', {
    'zgeoff/no-comment-rule-override': 'error',
  });

  expect(result.exitCode).toBe(0);
});

test('it reports an override once when a run lints several files', async () => {
  const rules = { 'zgeoff/no-comment-rule-override': 'error', 'zgeoff/no-jsdoc': 'off' };

  const files = {
    '.git': 'gitdir: elsewhere\n',
    'first.ts': 'export const first = 1;\n',
    'second.ts': 'export const second = 2;\n',
  };

  const result = await runLintTree(files, '.', rules);

  expect(result.exitCode).toBe(1);
  expect(result.stdout.split('sets zgeoff/no-jsdoc')).toHaveLength(2);
});

test.each([
  ['a class declaration', 'export class Kettle {}\n'],
  ['a class expression', 'export const Kettle = class {};\n'],
  ['a class that extends a class not named for an error', 'export class Kettle extends Map {}\n'],
  [
    'a class that extends a computed member',
    "export class Kettle extends errors['BrewError'] {}\n",
  ],
])('it flags %s', async (_label, source) => {
  const result = await runLint(source, { 'zgeoff/no-class': 'error' });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('zgeoff(no-class)');
});

test.each([
  ['a class that extends Error', 'export class KettleError extends Error {}\n'],
  ['a class that extends another error', 'export class KettleError extends BrewError {}\n'],
  ['a class that extends a member error', 'export class KettleError extends errors.BrewError {}\n'],
  ['a class expression that extends Error', 'export const KettleError = class extends Error {};\n'],
])('it accepts %s', async (_label, source) => {
  const result = await runLint(source, { 'zgeoff/no-class': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it names the factory and the custom-error exception in its message', async () => {
  const result = await runLint('export class Kettle {}\n', { 'zgeoff/no-class': 'error' });

  expect(result.stdout).toInclude(
    'Build this with a factory function (`create<X>` or `make<X>`), not a class. Only a custom error may be a class: `class XError extends Error`.',
  );
});

test.each([
  [
    'a type argument on a sql tag',
    'export const rows = sql<{ id: number }>`select id from plants`;\n',
  ],
  ['a type argument on a member sql tag', 'export const rows = db.sql<number>`select 1`;\n'],
  ['$castTo', 'export const rows = query.$castTo<Plant>();\n'],
  ['$narrowType', 'export const rows = query.$narrowType<{ name: string }>();\n'],
  ['$assertType', 'export const rows = query.$assertType<Plant>();\n'],
  ['a type argument on query()', "export const statement = sqlite.query<Plant, []>('select 1');\n"],
  ['a type argument on prepare()', "export const statement = sqlite.prepare<Plant>('select 1');\n"],
  ['a type argument on getObject()', "export const shape = config.getObject<Shape>('shape');\n"],
  [
    'a type argument on requireObject()',
    "export const shape = new Config().requireObject<Shape>('shape');\n",
  ],
  [
    'a type argument on getSecretObject()',
    "export const key = config.getSecretObject<Key>('key');\n",
  ],
  [
    'a type argument on requireSecretObject()',
    "export const key = config.requireSecretObject<Key>('key');\n",
  ],
  ['a computed method name', "export const statement = sqlite['query']<Plant>('select 1');\n"],
  ['an optional call', "export const statement = sqlite?.query<Plant>('select 1');\n"],
])('it flags %s', async (_label, source) => {
  const result = await runLint(source, { 'zgeoff/no-hidden-cast': 'error' });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('zgeoff(no-hidden-cast)');
});

test.each([
  ['a sql tag with no type argument', 'export const rows = sql`select id from plants`;\n'],
  ['query() with no type argument', "export const statement = sqlite.query('select 1');\n"],
  ['getObject() with no type argument', "export const shape = config.getObject('shape');\n"],
  ['a type argument on another method', "export const rows = db.selectFrom<Plant>('plants');\n"],
  ['an as const assertion', "export const sizes = ['small', 'large'] as const;\n"],
  ['a satisfies check', "export const sizes = ['small', 'large'] satisfies string[];\n"],
])('it accepts %s', async (_label, source) => {
  const result = await runLint(source, { 'zgeoff/no-hidden-cast': 'error' });

  expect(result.stdout).not.toInclude('no-hidden-cast');
});

test('it tells a sql tag to read its result as unknown and parse it', async () => {
  const result = await runLint('export const rows = sql<number>`select 1`;\n', {
    'zgeoff/no-hidden-cast': 'error',
  });

  expect(result.stdout).toInclude('read the result as `unknown`, and parse it with zod');
});

test('it names the Kysely method that claims a type', async () => {
  const result = await runLint('export const rows = query.$castTo<Plant>();\n', {
    'zgeoff/no-hidden-cast': 'error',
  });

  expect(result.stdout).toInclude('`$castTo()` claims a type that Kysely never checks');
});
