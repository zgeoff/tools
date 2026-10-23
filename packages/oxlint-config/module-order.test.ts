import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'module-order-test-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const config = {
    jsPlugins: [join(import.meta.dir, 'plugin.js')],
    rules: { 'zgeoff/module-order': 'error' },
  };

  await writeFile(join(directory, '.oxlintrc.json'), JSON.stringify(config));

  const oxlintBin = join(import.meta.dir, '..', '..', 'node_modules', '.bin', 'oxlint');
  const samplePath = join(directory, 'brew-tea.ts');

  const runOxlint = async (args: string[]) => {
    const subprocess = Bun.spawn(
      [oxlintBin, '--threads=1', '-c', '.oxlintrc.json', ...args, 'brew-tea.ts'],
      {
        cwd: directory,
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );

    const [exitCode, stdout] = await Promise.all([
      subprocess.exited,
      new Response(subprocess.stdout).text(),
    ]);

    return { exitCode, stdout };
  };

  const lint = async (source: string) => {
    await writeFile(samplePath, source);

    return runOxlint([]);
  };

  // oxlint runs one fix pass, so a second lint shows what that pass left
  const fix = async (source: string) => {
    await writeFile(samplePath, source);
    await runOxlint(['--fix']);

    const fixed = await readFile(samplePath, 'utf8');
    const after = await runOxlint([]);

    return { fixed, stdout: after.stdout };
  };

  return { lint, fix };
}

test.each([
  [
    'a helper above the primary export',
    `function pourCup(): string {
  return 'cup';
}

export function brewTea(): string {
  return pourCup();
}
`,
    "'pourCup' sits above the primary export 'brewTea' — move private helpers below it.",
  ],
  [
    'a helper above a default export',
    `function boil(): string {
  return 'boiled';
}

const kettle = {
  run(): string {
    return boil();
  },
};

export default kettle;
`,
    "'boil' sits above the primary export 'kettle' — move private helpers below it.",
  ],
  [
    'a helper above a default export of an object',
    `function boil(): string {
  return 'boiled';
}

export default { run: boil };
`,
    "'boil' sits above the primary export 'default' — move private helpers below it.",
  ],
  [
    'a helper above a primary export in an export list',
    `function pourCup(): string {
  return 'cup';
}

function brewTea(): string {
  return pourCup();
}

export { brewTea };
`,
    "'pourCup' sits above the primary export 'brewTea' — move private helpers below it.",
  ],
  [
    'a helper above the export the file is named for',
    `function pourCup(): string {
  return 'cup';
}

export function serveTea(): string {
  return 'served';
}

export function brewTea(): string {
  return pourCup();
}
`,
    "'pourCup' sits above the primary export 'brewTea' — move private helpers below it.",
  ],
  [
    'a helper above the only export, named apart from the file',
    `function pourCup(): string {
  return 'cup';
}

export function serveTea(): string {
  return pourCup();
}
`,
    "'pourCup' sits above the primary export 'serveTea' — move private helpers below it.",
  ],
  [
    'a nested helper after its parent’s sibling',
    `export function brewTea(): string {
  return boilWater() + steepLeaves();
}

function boilWater(): string {
  return heatKettle();
}

function steepLeaves(): string {
  return 'leaves';
}

function heatKettle(): string {
  return 'hot';
}
`,
    "'heatKettle' breaks composition order — helpers follow the primary export depth-first, so it belongs directly after 'boilWater'.",
  ],
  [
    'a const below its first use',
    `export function brewTea(): number {
  return steepMinutes * 60;
}

const steepMinutes = 3;
`,
    "'steepMinutes' sits below its first use in 'brewTea' — move it directly above 'brewTea'.",
  ],
  [
    'a type with another helper between it and its first use',
    `export function brewTea(): string {
  return warmPot() + pickLeaf({ name: 'oolong' }).name;
}

interface Leaf {
  readonly name: string;
}

function warmPot(): string {
  return 'pot';
}

function pickLeaf(leaf: Leaf): Leaf {
  return leaf;
}
`,
    "'Leaf' sits away from its first use in 'pickLeaf' — move it directly above 'pickLeaf'.",
  ],
  [
    'a type below a helper that runs as the module loads',
    `export const tea = brewTea();

function brewTea(): Tea {
  return { cups: 1 };
}

interface Tea {
  readonly cups: number;
}
`,
    "'Tea' sits below its first use in 'brewTea' — move it directly above 'brewTea'.",
  ],
  [
    'a const that leads the file for a helper',
    `const cupCount = 2;

export function brewTea(): number {
  return pourCups();
}

function pourCups(): number {
  return cupCount;
}
`,
    "'cupCount' leads the file, but the primary export does not use it — move it directly above its first use in 'pourCups'.",
  ],
  [
    'a helper whose name a re-export also lists',
    `export { boil } from './kettle.js';

function boil(): string {
  return 'boiled';
}

export function brewTea(): string {
  return boil();
}
`,
    "'boil' sits above the primary export 'brewTea' — move private helpers below it.",
  ],
])('it reports %s', async (_, source, message) => {
  const ctx = await setupTest();
  const result = await ctx.lint(source);

  expect(result.stdout).toInclude(message);
  expect(result.exitCode).toBe(1);
});

test.each([
  [
    'declarations the primary export uses just above it',
    `interface Order {
  readonly cups: number;
}

const maxCups = 4;

export function brewTea(order: Order): number {
  return Math.min(order.cups, maxCups);
}
`,
  ],
  [
    'helpers depth-first with their declarations stacked above them',
    `export function brewTea(): string {
  return boilWater() + steepLeaves();
}

const kettleName = 'steel';

function boilWater(): string {
  return heatKettle(kettleName);
}

type Heat = 'hot' | 'warm';

const defaultHeat: Heat = 'hot';

function heatKettle(name: string): Heat {
  return name === '' ? 'warm' : defaultHeat;
}

function steepLeaves(): string {
  return 'leaves';
}
`,
  ],
  [
    'a file with no primary export',
    `function pour(): string {
  return 'cup';
}

export function serveGreen(): string {
  return pour();
}

export function serveBlack(): string {
  return pour();
}
`,
  ],
  [
    'a const that a helper reads while the module loads',
    `const defaultTeas = ['green', 'black'];

const menu = { teas: listTeas() };

export default menu;

function listTeas(): string[] {
  return [...defaultTeas];
}
`,
  ],
  [
    'a const that a helper reads through another helper while the module loads',
    `const defaultTeas = ['green', 'black'];

const menu = { teas: listTeas() };

export default menu;

function listTeas(): string[] {
  return readTeas();
}

function readTeas(): string[] {
  return [...defaultTeas];
}
`,
  ],
  [
    'a const that a helper reads in a function called at once through `.call`',
    `const cupSize = 250;

export function brewTea(): number {
  return pourCup();
}

(() => pourCup()).call(null);

function pourCup(): number {
  return cupSize;
}
`,
  ],
])('it accepts %s', async (_, source) => {
  const ctx = await setupTest();
  const result = await ctx.lint(source);

  expect(result.stdout).not.toInclude('zgeoff(module-order)');
  expect(result.exitCode).toBe(0);
});

test.each([
  [
    'a helper and its comment below the primary export',
    `// pours one cup
function pourCup(): string {
  return 'cup';
}

export function brewTea(): string {
  return pourCup();
}
`,
    `export function brewTea(): string {
  return pourCup();
}

// pours one cup
function pourCup(): string {
  return 'cup';
}
`,
  ],
  [
    'a helper below a default export and its export statement',
    `function boil(): string {
  return 'boiled';
}

const kettle = {
  run(): string {
    return boil();
  },
};

export default kettle;
`,
    `const kettle = {
  run(): string {
    return boil();
  },
};

export default kettle;

function boil(): string {
  return 'boiled';
}
`,
  ],
  [
    'a helper below the only export, named apart from the file',
    `function pourCup(): string {
  return 'cup';
}

export function serveTea(): string {
  return pourCup();
}
`,
    `export function serveTea(): string {
  return pourCup();
}

function pourCup(): string {
  return 'cup';
}
`,
  ],
  [
    'helpers into depth-first order',
    `export function brewTea(): string {
  return boilWater() + steepLeaves();
}

function steepLeaves(): string {
  return 'leaves';
}

function heatKettle(): string {
  return 'hot';
}

function boilWater(): string {
  return heatKettle();
}
`,
    `export function brewTea(): string {
  return boilWater() + steepLeaves();
}

function boilWater(): string {
  return heatKettle();
}

function heatKettle(): string {
  return 'hot';
}

function steepLeaves(): string {
  return 'leaves';
}
`,
  ],
  [
    'a helper together with the declarations stacked above it',
    `const cupSize = 250;

function pourCup(): number {
  return cupSize;
}

export function brewTea(): number {
  return pourCup();
}
`,
    `export function brewTea(): number {
  return pourCup();
}

const cupSize = 250;

function pourCup(): number {
  return cupSize;
}
`,
  ],
  [
    'a const and a type directly above their first use',
    `interface Leaf {
  readonly name: string;
}

export function brewTea(): string {
  return warmPot() + pickLeaf({ name: 'oolong' }).name;
}

function warmPot(): string {
  return potName;
}

function pickLeaf(leaf: Leaf): Leaf {
  return leaf;
}

const potName = 'clay';
`,
    `export function brewTea(): string {
  return warmPot() + pickLeaf({ name: 'oolong' }).name;
}

const potName = 'clay';

function warmPot(): string {
  return potName;
}

interface Leaf {
  readonly name: string;
}

function pickLeaf(leaf: Leaf): Leaf {
  return leaf;
}
`,
  ],
  [
    'a declaration with its helper past another helper',
    `const leafPattern = /^leaf/u;

function isTea(name: string): boolean {
  return name !== '';
}

function isLeaf(name: string): boolean {
  return leafPattern.test(name);
}

export function brewTea(name: string): boolean {
  return isTea(name) && isLeaf(name);
}
`,
    `export function brewTea(name: string): boolean {
  return isTea(name) && isLeaf(name);
}

function isTea(name: string): boolean {
  return name !== '';
}

const leafPattern = /^leaf/u;

function isLeaf(name: string): boolean {
  return leafPattern.test(name);
}
`,
  ],
  [
    'the first declaration and leaves the file header in place',
    `// the tea service

// pours one cup
function pourCup(): string {
  return 'cup';
}

export function brewTea(): string {
  return pourCup();
}
`,
    `// the tea service

export function brewTea(): string {
  return pourCup();
}

// pours one cup
function pourCup(): string {
  return 'cup';
}
`,
  ],
  [
    'a const built with a constructor over literals',
    `const teaKinds = new Set(['green', 'black']);

export function brewTea(name: string): boolean {
  return isKnownTea(name);
}

function isKnownTea(name: string): boolean {
  return teaKinds.has(name);
}
`,
    `export function brewTea(name: string): boolean {
  return isKnownTea(name);
}

const teaKinds = new Set(['green', 'black']);

function isKnownTea(name: string): boolean {
  return teaKinds.has(name);
}
`,
  ],
  [
    'a const that copies an import, spreads a literal and uses operators',
    `import { greenTea } from './teas.js';

const teaSizes = { tea: greenTea, sizes: [...[250, 500], 2 * 125] };

export function brewTea(): number {
  return pickSize();
}

function pickSize(): number {
  return teaSizes.sizes.length;
}
`,
    `import { greenTea } from './teas.js';

export function brewTea(): number {
  return pickSize();
}

const teaSizes = { tea: greenTea, sizes: [...[250, 500], 2 * 125] };

function pickSize(): number {
  return teaSizes.sizes.length;
}
`,
  ],
])('it fixes %s', async (_, source, expected) => {
  const ctx = await setupTest();
  const result = await ctx.fix(source);

  expect(result.fixed).toBe(expected);
  expect(result.stdout).not.toInclude('zgeoff(module-order)');
});

test.each([
  [
    'a const whose value calls a local function',
    `const cupSize = measureCup();

export function brewTea(): number {
  return pourCup();
}

function pourCup(): number {
  return cupSize + lidSize;
}

function measureCup(): number {
  return 250;
}

const lidSize = 10;
`,
    `const cupSize = measureCup();

export function brewTea(): number {
  return pourCup();
}

const lidSize = 10;

function pourCup(): number {
  return cupSize + lidSize;
}

function measureCup(): number {
  return 250;
}
`,
    [
      "'cupSize' leads the file, but the primary export does not use it — move it directly above its first use in 'pourCup'.",
    ],
  ],
  [
    'a const that another const reads outside a function body',
    `export function brewTea(): number {
  return pourCup();
}

function pourCup(): number {
  return sizes.cup;
}

const cupSize = 250;

const sizes = { cup: cupSize };
`,
    `export function brewTea(): number {
  return pourCup();
}

function pourCup(): number {
  return sizes.cup;
}

const cupSize = 250;

const sizes = { cup: cupSize };
`,
    [
      "'cupSize' sits below its first use in 'pourCup' — move it directly above 'pourCup'.",
      "'sizes' sits below its first use in 'pourCup' — move it directly above 'pourCup'.",
    ],
  ],
  [
    'the consts a moved helper cannot take along',
    `const sizes = [250, 500];

const largest = Math.max(...sizes);

function pourCup(): number {
  return largest;
}

export function brewTea(): number {
  return pourCup();
}
`,
    `const sizes = [250, 500];

const largest = Math.max(...sizes);

export function brewTea(): number {
  return pourCup();
}

function pourCup(): number {
  return largest;
}
`,
    [
      "'sizes' leads the file, but the primary export does not use it — move it directly above its first use in 'largest'.",
      "'largest' leads the file, but the primary export does not use it — move it directly above its first use in 'pourCup'.",
    ],
  ],
  [
    'a const whose value reads state that load-time code changes',
    `const savedTea = process.env['TEA'] ?? 'green';

export function brewTea(): string {
  return readTea();
}

process.env['TEA'] = 'black';

function readTea(): string {
  return savedTea;
}
`,
    `const savedTea = process.env['TEA'] ?? 'green';

export function brewTea(): string {
  return readTea();
}

process.env['TEA'] = 'black';

function readTea(): string {
  return savedTea;
}
`,
    [
      "'savedTea' leads the file, but the primary export does not use it — move it directly above its first use in 'readTea'.",
    ],
  ],
  [
    'a const that a function called at once through `.call` reads',
    `const savedTea = 'green';

export function brewTea(): string {
  return readTea();
}

const menu = { tea: (() => savedTea).call(null) };

function readTea(): string {
  return savedTea + menu.tea;
}
`,
    `const savedTea = 'green';

export function brewTea(): string {
  return readTea();
}

const menu = { tea: (() => savedTea).call(null) };

function readTea(): string {
  return savedTea + menu.tea;
}
`,
    [
      "'savedTea' leads the file, but the primary export does not use it — move it directly above its first use in 'menu'.",
    ],
  ],
  [
    'a helper whose move would join two statements without semicolons',
    `console.log('start')

function pourCup(): string {
  return 'cup'
}

(function warm(): void {})()

export function brewTea(): string {
  return pourCup()
}
`,
    `console.log('start')

function pourCup(): string {
  return 'cup'
}

(function warm(): void {})()

export function brewTea(): string {
  return pourCup()
}
`,
    ["'pourCup' sits above the primary export 'brewTea' — move private helpers below it."],
  ],
  [
    'a const that a constructor builds from an import',
    `import { teaKinds } from './teas.js';

const knownTeas = new Set(teaKinds);

export function brewTea(name: string): boolean {
  return isKnownTea(name);
}

function isKnownTea(name: string): boolean {
  return knownTeas.has(name);
}
`,
    `import { teaKinds } from './teas.js';

const knownTeas = new Set(teaKinds);

export function brewTea(name: string): boolean {
  return isKnownTea(name);
}

function isKnownTea(name: string): boolean {
  return knownTeas.has(name);
}
`,
    [
      "'knownTeas' leads the file, but the primary export does not use it — move it directly above its first use in 'isKnownTea'.",
    ],
  ],
  [
    'a const whose operator runs an object’s valueOf',
    `let phase = 'cold';

const savedLength = +{ valueOf: () => phase.length };

export function brewTea(): number {
  return readLength();
}

phase = 'boiling';

function readLength(): number {
  return savedLength;
}
`,
    `let phase = 'cold';

const savedLength = +{ valueOf: () => phase.length };

export function brewTea(): number {
  return readLength();
}

phase = 'boiling';

function readLength(): number {
  return savedLength;
}
`,
    [
      "'savedLength' leads the file, but the primary export does not use it — move it directly above its first use in 'readLength'.",
    ],
  ],
  [
    'a const that reads a global the file shadows',
    `let NaN = 1;

const savedValue = NaN;

export function brewTea(): number {
  return readValue();
}

NaN = 2;

function readValue(): number {
  return savedValue;
}
`,
    `let NaN = 1;

const savedValue = NaN;

export function brewTea(): number {
  return readValue();
}

NaN = 2;

function readValue(): number {
  return savedValue;
}
`,
    [
      "'savedValue' leads the file, but the primary export does not use it — move it directly above its first use in 'readValue'.",
    ],
  ],
  [
    "a const whose binary operator runs an object's valueOf",
    `let phase = 'cold';

const savedLength = 0 + { valueOf: () => phase.length };

export function brewTea(): number {
  return readLength();
}

phase = 'boiling';

function readLength(): number {
  return savedLength;
}
`,
    `let phase = 'cold';

const savedLength = 0 + { valueOf: () => phase.length };

export function brewTea(): number {
  return readLength();
}

phase = 'boiling';

function readLength(): number {
  return savedLength;
}
`,
    [
      "'savedLength' leads the file, but the primary export does not use it — move it directly above its first use in 'readLength'.",
    ],
  ],
  [
    "a const whose template runs an object's toString",
    `let phase = 'cold';

const savedPhase = \`\${{ toString: () => phase }}\`;

export function brewTea(): string {
  return readPhase();
}

phase = 'boiling';

function readPhase(): string {
  return savedPhase;
}
`,
    `let phase = 'cold';

const savedPhase = \`\${{ toString: () => phase }}\`;

export function brewTea(): string {
  return readPhase();
}

phase = 'boiling';

function readPhase(): string {
  return savedPhase;
}
`,
    [
      "'savedPhase' leads the file, but the primary export does not use it — move it directly above its first use in 'readPhase'.",
    ],
  ],
])('it fixes what it can and leaves reported %s', async (_, source, expected, messages) => {
  const ctx = await setupTest();
  const result = await ctx.fix(source);

  const reported = messages.filter((message) => result.stdout.includes(message));

  expect(result.fixed).toBe(expected);
  expect(reported).toStrictEqual(messages);
  expect(result.stdout.split('zgeoff(module-order)')).toHaveLength(messages.length + 1);
});
