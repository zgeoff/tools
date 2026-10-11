import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const oxlintBin = join(import.meta.dir, '..', '..', 'node_modules', '.bin', 'oxlint');
const pluginPath = join(import.meta.dir, 'plugin.js');
const sharedTaxonomyPath = join(import.meta.dir, '..', '..', 'agents', 'shared.md');

interface LintResult {
  exitCode: number;
  stdout: string;
  output: string;
}

type RuleSettings = Readonly<Record<string, unknown>>;

type FileTree = Readonly<Record<string, string>>;

async function createLintTree(files: FileTree, rules: RuleSettings): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'oxlint-config-test-'));

  const config = { jsPlugins: [pluginPath], rules };

  await writeFile(join(dir, '.oxlintrc.json'), JSON.stringify(config));

  await Promise.all(
    Object.entries(files).map((entry: readonly [string, string]) => writeTreeFile(dir, entry)),
  );

  return dir;
}

async function writeTreeFile(dir: string, entry: readonly [string, string]): Promise<void> {
  const [path, content] = entry;

  await mkdir(dirname(join(dir, path)), { recursive: true });
  await writeFile(join(dir, path), content);
}

async function runLint(source: string, fix: boolean, rules: RuleSettings): Promise<LintResult> {
  const dir = await createLintTree({ 'sample.ts': source }, rules);

  const fixArgs = fix ? ['--fix'] : [];
  const args = [oxlintBin, '-c', '.oxlintrc.json', ...fixArgs, 'sample.ts'];
  const proc = Bun.spawn(args, { cwd: dir, stdout: 'pipe', stderr: 'pipe' });

  const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
  const output = await readFile(join(dir, 'sample.ts'), 'utf8');

  return { exitCode, stdout, output };
}

type TreeLintResult = Omit<LintResult, 'output'>;

async function runLintTree(
  files: FileTree,
  target: string,
  rules: RuleSettings,
): Promise<TreeLintResult> {
  const dir = await createLintTree(files, rules);

  return runLintIn(dir, dir, target);
}

async function runLintIn(dir: string, cwd: string, target: string): Promise<TreeLintResult> {
  const args = [
    oxlintBin,
    '-c',
    join(dir, '.oxlintrc.json'),
    '--report-unused-disable-directives-severity',
    'error',
    target,
  ];

  const proc = Bun.spawn(args, { cwd, stdout: 'pipe', stderr: 'pipe' });

  const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);

  return { exitCode, stdout };
}

function collectTaxonomyVerbs(markdown: string): string[] {
  const start = markdown.indexOf('### Function naming');
  const end = markdown.indexOf('**Banned**');
  const section = markdown.slice(start, end);
  const verbs = section.match(/(?<=^\| `)[a-z]+/gmu) ?? [];

  return [...new Set(verbs)];
}

function collectBannedVerbs(markdown: string): string[] {
  const start = markdown.indexOf('**Banned**');
  const end = markdown.indexOf('Algorithm-native');
  const paragraph = markdown.slice(start, end);
  const banned: string[] = [];

  for (const match of paragraph.matchAll(/`(?<verb>[a-z]+)`/gu)) {
    const preceding = paragraph.slice(0, match.index);
    const verb = match.groups?.['verb'];

    if (
      verb !== undefined &&
      countOccurrences(preceding, '(') === countOccurrences(preceding, ')')
    ) {
      banned.push(verb);
    }
  }

  return banned;
}

function countOccurrences(text: string, part: string): number {
  return text.split(part).length - 1;
}

const noJSDoc = { 'zgeoff/no-jsdoc': 'error' };
const maxRun = { 'zgeoff/max-consecutive-line-comments': 'error' };
const besideModule = { 'zgeoff/test-beside-module': 'error' };
const testSource = "import { test } from 'bun:test';\n\ntest('it runs', () => {});\n";

test('it flags a multi-line JSDoc block', async () => {
  const source = '/**\n * Documents the export.\n */\nexport const answer = 42;\n';

  const result = await runLint(source, false, noJSDoc);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('no-jsdoc');
});

test('it flags a single-line JSDoc block', async () => {
  const result = await runLint(
    '/** Documents the export. */\nexport const answer = 42;\n',
    false,
    noJSDoc,
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('no-jsdoc');
});

test('it flags a JSDoc block inside a class body', async () => {
  const source = 'class Box {\n  /**\n   * Holds the value.\n   */\n  value = 1;\n}\n';

  const result = await runLint(source, false, noJSDoc);

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

  const result = await runLint(source, false, noJSDoc);

  expect(result.exitCode).toBe(0);
});

test('it exempts inline @type and @lends casts', async () => {
  const source = 'export const config = /** @type {const} */ ({ port: 3000 });\n';

  const result = await runLint(source, false, noJSDoc);

  expect(result.exitCode).toBe(0);
});

test('it flags a run of four line comments and accepts three', async () => {
  const four = '// one\n// two\n// three\n// four\nexport const a = 1;\n';
  const three = '// one\n// two\n// three\nexport const a = 1;\n';

  const fourResult = await runLint(four, false, maxRun);
  const threeResult = await runLint(three, false, maxRun);

  expect(fourResult.exitCode).toBe(1);
  expect(fourResult.stdout).toInclude('max-consecutive-line-comments');
  expect(fourResult.stdout).toInclude('4 lines; the limit is 3');
  expect(threeResult.exitCode).toBe(0);
});

test('it honours the max option', async () => {
  const source = '// one\n// two\nexport const a = 1;\n';

  const result = await runLint(source, false, {
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

  const result = await runLint(source, false, maxRun);

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

  const result = await runLint(source, false, maxRun);

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

  const result = await runLint(source, false, maxRun);

  expect(result.exitCode).toBe(1);
});

test('it flags a function whose name lacks a taxonomy verb', async () => {
  const source = 'export function grabConfig(): number {\n  return 1;\n}\n';

  const result = await runLint(source, false, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('function-verb');
  expect(result.stdout).toInclude('grabConfig');
});

test('it points a banned verb at its replacement', async () => {
  const source = 'export function fetchUser(): number {\n  return 1;\n}\n';

  const result = await runLint(source, false, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude("banned verb 'fetch'");
  expect(result.stdout).toInclude('`read`');
});

test('it tells a vague banned verb to name what the function does', async () => {
  const source = 'export function processInput(): number {\n  return 1;\n}\n';

  const result = await runLint(source, false, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('name what the function does');
});

test('it accepts taxonomy verbs on declarations, const functions, and class methods', async () => {
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

  const result = await runLint(source, false, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it requires a suffix on templated verbs', async () => {
  const bare = 'export const handle = (): void => {};\n';
  const suffixed = 'export function handleRowClick(): void {}\n';

  const bareResult = await runLint(bare, false, { 'zgeoff/function-verb': 'error' });
  const suffixedResult = await runLint(suffixed, false, { 'zgeoff/function-verb': 'error' });

  expect(bareResult.exitCode).toBe(1);
  expect(suffixedResult.exitCode).toBe(0);
});

test('it matches a verb only at a camelCase boundary', async () => {
  const source = 'export function tokenize(): number {\n  return 1;\n}\n';

  const result = await runLint(source, false, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(1);
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

  const result = await runLint(source, false, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it flags a banned verb at a digit boundary', async () => {
  const source = 'export function save2FABackupCodes(): void {}\n';

  const result = await runLint(source, false, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude("banned verb 'save'");
});

test('it skips PascalCase names, object-literal properties, getters, and setters', async () => {
  const source = [
    'export function Component(): null {',
    '  return null;',
    '}',
    '',
    'export const visitor = {',
    '  enter(): void {},',
    '};',
    '',
    'export class Box {',
    '  get value(): number {',
    '    return 1;',
    '  }',
    '',
    '  set value(next: number) {}',
    '}',
    '',
  ].join('\n');

  const result = await runLint(source, false, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it accepts repo-local verbs added through the verbs option', async () => {
  const source = 'export function walkTree(): void {}\n';

  const bareRule = await runLint(source, false, { 'zgeoff/function-verb': 'error' });

  const extended = await runLint(source, false, {
    'zgeoff/function-verb': ['error', { verbs: ['walk'] }],
  });

  expect(bareRule.exitCode).toBe(1);
  expect(extended.exitCode).toBe(0);
});

test('it skips names listed in the exemptNames option', async () => {
  const source = 'export function main(): void {}\n';

  const result = await runLint(source, false, {
    'zgeoff/function-verb': ['error', { exemptNames: ['main'] }],
  });

  expect(result.exitCode).toBe(0);
});

test('it accepts every verb in the shared taxonomy', async () => {
  const markdown = await readFile(sharedTaxonomyPath, 'utf8');

  const verbs = collectTaxonomyVerbs(markdown);

  expect(verbs.length).toBeGreaterThan(40);

  const lines = verbs.map((verb) => `export function ${verb}Thing(): void {}`);

  const result = await runLint(`${lines.join('\n')}\n`, false, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(0);
});

test('it rejects every verb the shared taxonomy bans', async () => {
  const markdown = await readFile(sharedTaxonomyPath, 'utf8');

  const banned = collectBannedVerbs(markdown).filter((verb) => verb !== 'handle');

  expect(banned.length).toBeGreaterThan(10);

  const lines = banned.map((verb) => `export function ${verb}Thing(): void {}`);

  const result = await runLint(`${lines.join('\n')}\n`, false, { 'zgeoff/function-verb': 'error' });

  expect(result.exitCode).toBe(1);

  for (const verb of banned) {
    expect(result.stdout).toInclude(`${verb}Thing`);
  }
});

test('it flags a test file with no module beside it', async () => {
  const result = await runLintTree(
    { 'src/parse-entry.test.ts': testSource, 'src/other.ts': '' },
    'src/parse-entry.test.ts',
    besideModule,
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('test-beside-module');
  expect(result.stdout).toInclude('parse-entry.<ext>');
});

test('it flags a .test.tsx file with no module beside it', async () => {
  const result = await runLintTree(
    { 'src/view.test.tsx': testSource },
    'src/view.test.tsx',
    besideModule,
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('view.<ext>');
});

test('it accepts a test beside a .ts, .tsx, .sh, or .json module', async () => {
  const results = await Promise.all(
    ['parse-entry.ts', 'view.tsx', 'install.sh', 'turbo.json'].map((module) => {
      const testFile = module.replace(/\.[a-z]+$/u, '.test.ts');

      return runLintTree({ [module]: '', [testFile]: testSource }, testFile, besideModule);
    }),
  );

  expect(results.map((result: Readonly<TreeLintResult>) => result.exitCode)).toStrictEqual([
    0, 0, 0, 0,
  ]);
});

test('it accepts a .test.tsx file beside its module', async () => {
  const result = await runLintTree(
    { 'view.tsx': '', 'view.test.tsx': testSource },
    'view.test.tsx',
    besideModule,
  );

  expect(result.exitCode).toBe(0);
});

test('it counts neither another test nor a declaration file as the module', async () => {
  const declaration = await runLintTree(
    { 'egress.test.ts': testSource, 'egress.d.ts': '' },
    'egress.test.ts',
    besideModule,
  );

  const otherTest = await runLintTree(
    { 'egress.test.ts': testSource, 'egress.test.test.ts': testSource },
    'egress.test.test.ts',
    besideModule,
  );

  expect(declaration.exitCode).toBe(1);
  expect(declaration.stdout).toInclude('egress.<ext>');
  expect(otherTest.exitCode).toBe(1);
  expect(otherTest.stdout).toInclude('egress.test.<ext>');
});

test('it counts a symlinked module', async () => {
  const dir = await createLintTree({ 'real.ts': '', 'link.test.ts': testSource }, besideModule);

  await symlink(join(dir, 'real.ts'), join(dir, 'link.ts'));

  const result = await runLintIn(dir, dir, 'link.test.ts');

  expect(result.exitCode).toBe(0);
});

test('it flags a test-kind suffix test beside only the base module', async () => {
  const result = await runLintTree(
    { 'egress-ruleset.ts': '', 'egress-ruleset.host.test.ts': testSource },
    'egress-ruleset.host.test.ts',
    besideModule,
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('egress-ruleset.host.<ext>');
});

test('it exempts tests under a root e2e/ or evals/ directory', async () => {
  const e2e = await runLintTree({ 'e2e/cli.test.ts': testSource }, 'e2e/cli.test.ts', besideModule);

  const evals = await runLintTree(
    { 'evals/agent/plan.test.ts': testSource },
    'evals/agent/plan.test.ts',
    besideModule,
  );

  expect(e2e.exitCode).toBe(0);
  expect(evals.exitCode).toBe(0);
});

test('it flags tests under test-utils/ or a nested e2e/ directory', async () => {
  const testUtils = await runLintTree(
    { 'test-utils/fixtures.test.ts': testSource },
    'test-utils/fixtures.test.ts',
    besideModule,
  );

  const nestedE2E = await runLintTree(
    { 'packages/cli/e2e/run.test.ts': testSource },
    'packages/cli/e2e/run.test.ts',
    besideModule,
  );

  expect(testUtils.exitCode).toBe(1);
  expect(testUtils.stdout).toInclude('fixtures.<ext>');
  expect(nestedE2E.exitCode).toBe(1);
  expect(nestedE2E.stdout).toInclude('run.<ext>');
});

test('it anchors the e2e/ exemption on the repo root, not the working directory', async () => {
  const dir = await createLintTree(
    {
      '.git/HEAD': '',
      'e2e/root.test.ts': testSource,
      'packages/cli/e2e/run.test.ts': testSource,
    },
    besideModule,
  );

  const packageCWD = join(dir, 'packages', 'cli');

  const nested = await runLintIn(dir, packageCWD, 'e2e/run.test.ts');
  const root = await runLintIn(dir, packageCWD, join(dir, 'e2e', 'root.test.ts'));

  expect(nested.exitCode).toBe(1);
  expect(nested.stdout).toInclude('run.<ext>');
  expect(root.exitCode).toBe(0);
});

test('it honours a file-level disable comment with a reason', async () => {
  const source = `// oxlint-disable zgeoff/test-beside-module -- tests two configs at once\n${testSource}`;

  const result = await runLintTree({ 'configs.test.ts': source }, 'configs.test.ts', besideModule);

  expect(result.exitCode).toBe(0);
});
