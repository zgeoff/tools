import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const oxlintBin = join(import.meta.dir, '..', '..', 'node_modules', '.bin', 'oxlint');
const pluginPath = join(import.meta.dir, 'plugin.js');

const sharedTaxonomyPath = join(
  import.meta.dir,
  '..',
  '..',
  '.claude',
  'skills',
  'code-style',
  'SKILL.md',
);

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
  const start = markdown.indexOf('## Function naming');
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

const noFileSnapshot = { 'zgeoff/no-file-snapshot': 'error' };

test.each(['toMatchSnapshot', 'toThrowErrorMatchingSnapshot'])(
  'it flags the file-backed %s matcher',
  async (matcher) => {
    const source = `import { expect, test } from 'bun:test';\n\ntest('it renders the banner', () => {\n  expect('ready').${matcher}();\n});\n`;

    const result = await runLint(source, false, noFileSnapshot);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toInclude('no-file-snapshot');
    expect(result.stdout).toInclude(matcher);
  },
);

test('it flags a negated and a computed file snapshot matcher', async () => {
  const source =
    "import { expect, test } from 'bun:test';\n\ntest('it renders the banner', () => {\n  expect('ready').not.toMatchSnapshot();\n  expect('ready')['toMatchSnapshot']();\n});\n";

  const result = await runLint(source, false, noFileSnapshot);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('sample.ts:4:23');
  expect(result.stdout).toInclude('sample.ts:5:19');
});

test('it accepts inline snapshot matchers', async () => {
  const source =
    "import { expect, test } from 'bun:test';\n\ntest('it renders the banner', () => {\n  expect('ready').toMatchInlineSnapshot(`\"ready\"`);\n  expect(() => {\n    throw new Error('late');\n  }).toThrowErrorMatchingInlineSnapshot(`\"late\"`);\n});\n";

  const result = await runLint(source, false, noFileSnapshot);

  expect(result.exitCode).toBe(0);
});

test('it flags a test file with a snapshot file beside it in __snapshots__/', async () => {
  const result = await runLintTree(
    {
      'src/banner.ts': '',
      'src/banner.test.ts': testSource,
      'src/__snapshots__/banner.test.ts.snap': '// Bun Snapshot v1\n',
    },
    'src/banner.test.ts',
    noFileSnapshot,
  );

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('no-file-snapshot');
  expect(result.stdout).toInclude('__snapshots__/banner.test.ts.snap');
});

test('it accepts a test file whose name no snapshot file in __snapshots__/ matches', async () => {
  const result = await runLintTree(
    {
      'banner.test.ts': testSource,
      '__snapshots__/footer.test.ts.snap': '// Bun Snapshot v1\n',
    },
    'banner.test.ts',
    noFileSnapshot,
  );

  expect(result.exitCode).toBe(0);
});

test('it honours a file-level disable comment on a snapshot file', async () => {
  const source = `// oxlint-disable zgeoff/no-file-snapshot -- migrates the legacy golden files\n${testSource}`;

  const result = await runLintTree(
    { 'banner.test.ts': source, '__snapshots__/banner.test.ts.snap': '// Bun Snapshot v1\n' },
    'banner.test.ts',
    noFileSnapshot,
  );

  expect(result.exitCode).toBe(0);
});

const restricted = { 'zgeoff/no-restricted-words': ['error', { words: ['orb', 'orbd'] }] };

test.each([
  ['string', "export const label = 'ask the orb daemon';\n"],
  ['template', 'export const label = `ask the orbd`;\n'],
  ['comment', '// the orb owns this socket\nexport const label = 1;\n'],
  ['comment', '/* the orb owns this socket */\nexport const label = 1;\n'],
])('it flags a restricted word in a %s', async (place, source) => {
  const result = await runLint(source, false, restricted);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('no-restricted-words');
  expect(result.stdout).toInclude(`from this ${place}`);
});

test('it flags a restricted word whatever its case and names it as written', async () => {
  const source = "export const label = 'the ORB daemon';\n";

  const result = await runLint(source, false, restricted);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Remove `ORB`');
});

test('it flags a restricted word bounded by punctuation', async () => {
  const source = "export const socket = '/run/orbd.sock';\nexport const vault = 'orb-e2e';\n";

  const result = await runLint(source, false, restricted);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Remove `orbd`');
  expect(result.stdout).toInclude('Remove `orb`');
});

test('it accepts a word that holds a restricted word inside it', async () => {
  const source =
    '// the orbit keeps its own clock\nexport const label = `orbs, absorb, sorbet, orb_name, orb2`;\n';

  const result = await runLint(source, false, restricted);

  expect(result.exitCode).toBe(0);
});

test('it accepts a restricted word as an identifier', async () => {
  const source = 'const orb = 1;\n\nexport const label = orb;\n';

  const result = await runLint(source, false, restricted);

  expect(result.exitCode).toBe(0);
});

test('it treats a restricted word as text, not as a pattern', async () => {
  const rules = { 'zgeoff/no-restricted-words': ['error', { words: ['a.b'] }] };
  const source = "export const label = 'axb';\nexport const other = 'a.b';\n";

  const result = await runLint(source, false, rules);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('sample.ts:2:');
  expect(result.stdout).not.toInclude('sample.ts:1:');
});

test('it reports nothing when the config names no words', async () => {
  const source = "export const label = 'ask the orb daemon';\n";

  const result = await runLint(source, false, { 'zgeoff/no-restricted-words': 'error' });

  expect(result.exitCode).toBe(0);
});

const abbreviated = {
  'zgeoff/no-abbreviated-names': ['error', { names: { src: '`source`', ms: 'a unit suffix' } }],
};

// every form that binds a name, with NAME where the name goes; each row runs
// once with `src`, which the rule reports, and once with `source`, which it
// accepts
const nameForms = [
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
] as const;

// a private name reports with its `#`, so these rows take their own message
const privateNameForms = [
  ['a private field', 'export class Paths {\n  #NAME = 1;\n}\n'],
  ['a private getter', 'export class Paths {\n  get #NAME(): number {\n    return 1;\n  }\n}\n'],
  ['a private method', 'export class Paths {\n  #NAME(): number {\n    return 1;\n  }\n}\n'],
] as const;

test.each(nameForms)('it reports an abbreviated name in %s', async (_place, template) => {
  const result = await runLint(template.replaceAll('NAME', 'src'), false, abbreviated);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Rename `src` to `source`');
});

test.each(privateNameForms)('it reports an abbreviated name in %s', async (_place, template) => {
  const result = await runLint(template.replaceAll('NAME', 'src'), false, abbreviated);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('Rename `#src` to `source`');
});

test.each([...nameForms, ...privateNameForms])(
  'it accepts a full name in %s',
  async (_place, template) => {
    const result = await runLint(template.replaceAll('NAME', 'source'), false, abbreviated);

    expect(result.stdout).not.toInclude('no-abbreviated-names');
  },
);

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
  const result = await runLint(source, false, abbreviated);

  expect(result.stdout).not.toInclude('no-abbreviated-names');
});

test('it accepts an abbreviation inside a longer name', async () => {
  const source = 'export const timeoutMs = 1;\nexport const srcPath = 2;\n';

  const result = await runLint(source, false, abbreviated);

  expect(result.exitCode).toBe(0);
});

test('it accepts a destructured key that an alias renames', async () => {
  const source =
    'const { src: source } = Object.fromEntries([["src", 1]]);\n\nexport const value = source;\n';

  const result = await runLint(source, false, abbreviated);

  expect(result.exitCode).toBe(0);
});

test('it accepts an abbreviated name read from another object', async () => {
  const source =
    'const paths = { source: 1 };\n\nexport const value = Reflect.get(paths, "src") ?? process.src;\n';

  const result = await runLint(source, false, abbreviated);

  expect(result.exitCode).toBe(0);
});

test('it reports nothing when the config names no abbreviations', async () => {
  const result = await runLint('export const src = 1;\n', false, {
    'zgeoff/no-abbreviated-names': 'error',
  });

  expect(result.exitCode).toBe(0);
});

const layered = {
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
};

test('it flags an import across a forbidden edge', async () => {
  const result = await runLintTree(
    {
      'src/config/read-config.ts': "import { run } from '../../scripts/run';\n\nrun();\n",
      'scripts/run.ts': 'export function run(): void {}\n',
    },
    'src/config/read-config.ts',
    layered,
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
    layered,
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
    layered,
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

  const result = await runLintTree(files, 'src/judge/run-judge.ts', layered);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('stages: stage must not import src/rules/split.ts (core, stage)');
});

test('it accepts a type-only import where the edge allows one', async () => {
  const files = {
    'src/config/read-config.ts':
      "import type { Verdict } from '../judge/types';\n\nexport const verdict: Verdict = 'allow';\n",
    'src/judge/types.ts': "export type Verdict = 'allow' | 'deny';\n",
  };

  const result = await runLintTree(files, 'src/config/read-config.ts', layered);

  expect(result.exitCode).toBe(0);
});

test('it flags a type-only import of a file the edge does not exempt', async () => {
  const files = {
    'src/config/read-config.ts':
      "import { type Verdict } from '../judge/judge';\n\nexport const verdict: Verdict = 'allow';\n",
    'src/judge/judge.ts': "export type Verdict = 'allow' | 'deny';\n",
  };

  const result = await runLintTree(files, 'src/config/read-config.ts', layered);

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

  const result = await runLintTree(files, 'src/model/send.ts', layered);

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

  const result = await runLintTree(files, 'src/state/load.ts', layered);

  const reports = result.stdout.match(/unresolved: cannot check a computed import specifier/gu);

  expect(result.exitCode).toBe(1);
  expect(reports).toHaveLength(2);
});

test('it flags a restricted module outside its zones', async () => {
  const files = {
    'src/state/send.ts': "import { request } from 'node:https';\n\nrequest('https://x.test');\n",
  };

  const result = await runLintTree(files, 'src/state/send.ts', layered);

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

  const dir = await createLintTree(files, layered);

  const results = await Promise.all(
    ['src/model/send.ts', 'src/state/agent.ts', 'scripts/send.ts'].map((target: string) =>
      runLintIn(dir, dir, target),
    ),
  );

  expect(results.map((result: TreeLintResult) => result.exitCode)).toStrictEqual([0, 0, 0]);
});

test('it flags a restricted global call outside its zones', async () => {
  const files = {
    'src/state/send.ts':
      "await fetch('https://x.test');\nawait globalThis.fetch('https://x.test');\n",
    'src/model/send.ts': "await fetch('https://x.test');\n",
  };

  const dir = await createLintTree(files, layered);
  const outside = await runLintIn(dir, dir, 'src/state/send.ts');
  const inside = await runLintIn(dir, dir, 'src/model/send.ts');

  expect(outside.exitCode).toBe(1);
  expect(outside.stdout.match(/network: fetch\(\) is allowed only in network/gu)).toHaveLength(2);
  expect(inside.exitCode).toBe(0);
});

test('it flags a file that belongs to none of the required zones, unless ignored', async () => {
  const files = {
    'src/stray/run.ts': 'export const answer = 42;\n',
    'src/stray/run.test.ts': 'export const answer = 42;\n',
  };

  const dir = await createLintTree(files, layered);
  const stray = await runLintIn(dir, dir, 'src/stray/run.ts');
  const ignored = await runLintIn(dir, dir, 'src/stray/run.test.ts');

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

  const result = await runLintTree(files, 'src/state/read.ts', layered);

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

  const result = await runLintTree(files, 'src/config/read-config.ts', layered);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('core-no-tooling: core must not import scripts/run.ts');
});

test('it resolves a specifier with a bundler query to the file before the query', async () => {
  const files = {
    'src/config/theme.ts': "import styles from '../../scripts/styles.css?url';\n\nstyles;\n",
    'scripts/styles.css': 'body {}\n',
  };

  const result = await runLintTree(files, 'src/config/theme.ts', layered);

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

  const result = await runLintTree(files, 'src/config/read-config.ts', layered);

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

  const dir = await createLintTree(files, rules);
  const contract = await runLintIn(dir, dir, 'src/read.ts');
  const hook = await runLintIn(dir, dir, 'src/hook.ts');

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

test('it resolves a workspace package’s name through that package’s exports', async () => {
  const rules = {
    'zgeoff/import-zones': [
      'error',
      {
        zones: { app: ['packages/app/**'], testing: ['packages/*/src/testing/**'] },
        workspaces: ['packages/*'],
        edges: [{ name: 'no-testing', from: ['app'], to: ['testing'] }],
        modules: [{ name: 'store-module', modules: ['@demo/store'], allow: [] }],
      },
    ],
  };

  const files = {
    'packages/store/package.json': JSON.stringify({
      name: '@demo/store',
      exports: { '.': './src/index.ts', './testing': './src/testing/index.ts' },
    }),
    'packages/store/src/index.ts': 'export const store = 1;\n',
    'packages/store/src/testing/index.ts': 'export const fake = 1;\n',
    'packages/app/src/run.ts':
      "import { store } from '@demo/store';\nimport { fake } from '@demo/store/testing';\n\nexport const all = [store, fake];\n",
  };

  const result = await runLintTree(files, 'packages/app/src/run.ts', rules);

  expect(result.exitCode).toBe(1);

  expect(result.stdout).toInclude(
    'no-testing: app must not import packages/store/src/testing/index.ts (testing)',
  );

  expect(result.stdout).not.toInclude('store-module');
});

test('it reports a workspace export whose file does not exist as unresolved', async () => {
  const rules = {
    'zgeoff/import-zones': [
      'error',
      {
        zones: { app: ['packages/app/**'] },
        workspaces: ['packages/*'],
        unresolved: [{ name: 'unresolved', from: ['app'] }],
      },
    ],
  };

  const files = {
    'packages/store/package.json': JSON.stringify({
      name: '@demo/store',
      exports: { '.': './src/missing.ts' },
    }),
    'packages/app/src/run.ts':
      "import { store } from '@demo/store';\n\nexport const all = [store];\n",
  };

  const result = await runLintTree(files, 'packages/app/src/run.ts', rules);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('unresolved: cannot resolve @demo/store');
});

test('it reports no self-import for another workspace package', async () => {
  const rules = {
    'zgeoff/import-zones': [
      'error',
      {
        zones: { app: ['packages/app/**'] },
        workspaces: ['packages/*'],
        selfImports: [{ name: 'self', from: ['app'] }],
      },
    ],
  };

  const files = {
    'packages/store/package.json': JSON.stringify({
      name: '@demo/store',
      exports: { '.': './src/index.ts' },
    }),
    'packages/store/src/index.ts': 'export const store = 1;\n',
    'packages/app/package.json': JSON.stringify({ name: '@demo/app' }),
    'packages/app/src/run.ts':
      "import { store } from '@demo/store';\n\nexport const all = [store];\n",
  };

  const result = await runLintTree(files, 'packages/app/src/run.ts', rules);

  expect(result.exitCode).toBe(0);
});

test('it reads a workspace glob written with a leading ./', async () => {
  const rules = {
    'zgeoff/import-zones': [
      'error',
      {
        zones: { app: ['packages/app/**'], testing: ['packages/*/src/testing/**'] },
        workspaces: ['./packages/*'],
        edges: [{ name: 'no-testing', from: ['app'], to: ['testing'] }],
      },
    ],
  };

  const files = {
    'packages/store/package.json': JSON.stringify({
      name: '@demo/store',
      exports: { './testing': './src/testing/index.ts' },
    }),
    'packages/store/src/testing/index.ts': 'export const fake = 1;\n',
    'packages/app/src/run.ts':
      "import { fake } from '@demo/store/testing';\n\nexport const all = [fake];\n",
  };

  const result = await runLintTree(files, 'packages/app/src/run.ts', rules);

  expect(result.exitCode).toBe(1);

  expect(result.stdout).toInclude(
    'no-testing: app must not import packages/store/src/testing/index.ts (testing)',
  );
});

test('it leaves a package below the workspace glob’s depth a module', async () => {
  const rules = {
    'zgeoff/import-zones': [
      'error',
      {
        zones: { app: ['packages/app/**'] },
        workspaces: ['packages/*'],
        modules: [{ name: 'store-module', modules: ['@demo/store'], allow: [] }],
      },
    ],
  };

  const files = {
    'packages/group/store/package.json': JSON.stringify({
      name: '@demo/store',
      exports: { '.': './src/index.ts' },
    }),
    'packages/group/store/src/index.ts': 'export const store = 1;\n',
    'packages/app/src/run.ts':
      "import { store } from '@demo/store';\n\nexport const all = [store];\n",
  };

  const result = await runLintTree(files, 'packages/app/src/run.ts', rules);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('store-module: @demo/store is allowed only in no zone');
});

test('it resolves a # alias of the file’s own package without a self-import report', async () => {
  const rules = {
    'zgeoff/import-zones': [
      'error',
      {
        zones: { core: ['src/**'], tooling: ['scripts/**'] },
        edges: [{ name: 'core-no-tooling', from: ['core'], to: ['tooling'] }],
        selfImports: [{ name: 'self', from: ['core'] }],
      },
    ],
  };

  const files = {
    'package.json': JSON.stringify({
      name: '@demo/store',
      imports: { '#store': '@demo/store' },
      exports: { '.': './scripts/run.ts' },
    }),
    'src/index.ts': "import { run } from '#store';\n\nrun();\n",
    'scripts/run.ts': 'export function run(): void {}\n',
  };

  const result = await runLintTree(files, 'src/index.ts', rules);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('core-no-tooling: core must not import scripts/run.ts');
  expect(result.stdout).not.toInclude('self:');
});

test('it resolves a # import that names a workspace package as that name would', async () => {
  const rules = {
    'zgeoff/import-zones': [
      'error',
      {
        zones: { app: ['packages/app/**'], testing: ['packages/*/src/testing/**'] },
        workspaces: ['packages/*'],
        edges: [{ name: 'no-testing', from: ['app'], to: ['testing'] }],
      },
    ],
  };

  const files = {
    'packages/store/package.json': JSON.stringify({
      name: '@demo/store',
      exports: { './testing': './src/testing/index.ts' },
    }),
    'packages/store/src/testing/index.ts': 'export const fake = 1;\n',
    'packages/app/package.json': JSON.stringify({
      name: '@demo/app',
      imports: { '#store-testing': '@demo/store/testing' },
    }),
    'packages/app/src/run.ts':
      "import { fake } from '#store-testing';\n\nexport const all = [fake];\n",
  };

  const result = await runLintTree(files, 'packages/app/src/run.ts', rules);

  expect(result.exitCode).toBe(1);

  expect(result.stdout).toInclude(
    'no-testing: app must not import packages/store/src/testing/index.ts (testing)',
  );
});

test('it reports a workspace subpath that the package’s exports omit as unresolved', async () => {
  const rules = {
    'zgeoff/import-zones': [
      'error',
      {
        zones: { app: ['packages/app/**'] },
        workspaces: ['packages/*'],
        unresolved: [{ name: 'unresolved', from: ['app'] }],
      },
    ],
  };

  const files = {
    'packages/store/package.json': JSON.stringify({
      name: '@demo/store',
      exports: { '.': './src/index.ts' },
    }),
    'packages/store/src/index.ts': 'export const store = 1;\n',
    'packages/store/src/rows.ts': 'export const rows = 1;\n',
    'packages/app/src/run.ts':
      "import { rows } from '@demo/store/src/rows';\n\nexport const all = [rows];\n",
  };

  const result = await runLintTree(files, 'packages/app/src/run.ts', rules);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toInclude('unresolved: cannot resolve @demo/store/src/rows');
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

  const dir = await createLintTree(files, rules);
  const byName = await runLintIn(dir, dir, 'packages/store/src/by-name.ts');
  const byPath = await runLintIn(dir, dir, 'packages/store/src/by-path.ts');

  expect(byName.exitCode).toBe(1);

  expect(byName.stdout).toInclude(
    'self: @demo/store names the package this file belongs to; import it by a relative path — a package imports itself by path',
  );

  expect(byPath.exitCode).toBe(0);
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

  const result = await runLintTree({ 'src/state/send.ts': source }, 'src/state/send.ts', layered);

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
