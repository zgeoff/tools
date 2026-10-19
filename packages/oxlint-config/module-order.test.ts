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
    const subprocess = Bun.spawn([oxlintBin, '-c', '.oxlintrc.json', ...args, 'brew-tea.ts'], {
      cwd: directory,
      stdout: 'pipe',
      stderr: 'pipe',
    });

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

  // runs `--fix` once, then lints the fixed file again
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
])('it accepts %s', async (_, source) => {
  const ctx = await setupTest();
  const result = await ctx.lint(source);

  expect(result.stdout).not.toInclude('zgeoff(module-order)');
  expect(result.exitCode).toBe(0);
});

test('it moves a helper and its comment below the primary export', async () => {
  const ctx = await setupTest();

  const result = await ctx.fix(`// pours one cup
function pourCup(): string {
  return 'cup';
}

export function brewTea(): string {
  return pourCup();
}
`);

  expect(result.fixed).toBe(`export function brewTea(): string {
  return pourCup();
}

// pours one cup
function pourCup(): string {
  return 'cup';
}
`);

  expect(result.stdout).not.toInclude('zgeoff(module-order)');
});

test('it moves a helper below a default export and its export statement', async () => {
  const ctx = await setupTest();

  const result = await ctx.fix(`function boil(): string {
  return 'boiled';
}

const kettle = {
  run(): string {
    return boil();
  },
};

export default kettle;
`);

  expect(result.fixed).toBe(`const kettle = {
  run(): string {
    return boil();
  },
};

export default kettle;

function boil(): string {
  return 'boiled';
}
`);

  expect(result.stdout).not.toInclude('zgeoff(module-order)');
});

test('it moves helpers into depth-first order', async () => {
  const ctx = await setupTest();

  const result = await ctx.fix(`export function brewTea(): string {
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
`);

  expect(result.fixed).toBe(`export function brewTea(): string {
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
`);

  expect(result.stdout).not.toInclude('zgeoff(module-order)');
});

test('it moves a helper together with the declarations stacked above it', async () => {
  const ctx = await setupTest();

  const result = await ctx.fix(`const cupSize = 250;

function pourCup(): number {
  return cupSize;
}

export function brewTea(): number {
  return pourCup();
}
`);

  expect(result.fixed).toBe(`export function brewTea(): number {
  return pourCup();
}

const cupSize = 250;

function pourCup(): number {
  return cupSize;
}
`);

  expect(result.stdout).not.toInclude('zgeoff(module-order)');
});

test('it moves a const and a type directly above their first use', async () => {
  const ctx = await setupTest();

  const result = await ctx.fix(`interface Leaf {
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
`);

  expect(result.fixed).toBe(`export function brewTea(): string {
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
`);

  expect(result.stdout).not.toInclude('zgeoff(module-order)');
});

test('it leaves reported a const whose value calls a local function', async () => {
  const ctx = await setupTest();

  const result = await ctx.fix(`const cupSize = measureCup();

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
`);

  expect(result.fixed).toBe(`const cupSize = measureCup();

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
`);

  expect(result.stdout).toInclude(
    "'cupSize' leads the file, but the primary export does not use it — move it directly above its first use in 'pourCup'.",
  );

  expect(result.stdout).not.toInclude("'lidSize'");
});

test('it leaves reported a const that another const reads outside a function body', async () => {
  const ctx = await setupTest();

  const source = `export function brewTea(): number {
  return pourCup();
}

function pourCup(): number {
  return sizes.cup;
}

const cupSize = 250;

const sizes = { cup: cupSize };
`;

  const result = await ctx.fix(source);

  expect(result.fixed).toBe(source);

  expect(result.stdout).toInclude(
    "'cupSize' sits below its first use in 'pourCup' — move it directly above 'pourCup'.",
  );

  expect(result.stdout).toInclude(
    "'sizes' sits below its first use in 'pourCup' — move it directly above 'pourCup'.",
  );
});

test('it moves a declaration with its helper past another helper', async () => {
  const ctx = await setupTest();

  const result = await ctx.fix(`const leafPattern = /^leaf/u;

function isTea(name: string): boolean {
  return name !== '';
}

function isLeaf(name: string): boolean {
  return leafPattern.test(name);
}

export function brewTea(name: string): boolean {
  return isTea(name) && isLeaf(name);
}
`);

  expect(result.fixed).toBe(`export function brewTea(name: string): boolean {
  return isTea(name) && isLeaf(name);
}

function isTea(name: string): boolean {
  return name !== '';
}

const leafPattern = /^leaf/u;

function isLeaf(name: string): boolean {
  return leafPattern.test(name);
}
`);

  expect(result.stdout).not.toInclude('zgeoff(module-order)');
});

test('it moves a helper and leaves reported the consts it cannot move', async () => {
  const ctx = await setupTest();

  const result = await ctx.fix(`const sizes = [250, 500];

const largest = Math.max(...sizes);

function pourCup(): number {
  return largest;
}

export function brewTea(): number {
  return pourCup();
}
`);

  expect(result.fixed).toBe(`const sizes = [250, 500];

const largest = Math.max(...sizes);

export function brewTea(): number {
  return pourCup();
}

function pourCup(): number {
  return largest;
}
`);

  expect(result.stdout).toInclude(
    "'sizes' leads the file, but the primary export does not use it — move it directly above its first use in 'largest'.",
  );

  expect(result.stdout).toInclude(
    "'largest' leads the file, but the primary export does not use it — move it directly above its first use in 'pourCup'.",
  );
});

test('it leaves a file header in place when the first declaration moves', async () => {
  const ctx = await setupTest();

  const result = await ctx.fix(`// the tea service

// pours one cup
function pourCup(): string {
  return 'cup';
}

export function brewTea(): string {
  return pourCup();
}
`);

  expect(result.fixed).toBe(`// the tea service

export function brewTea(): string {
  return pourCup();
}

// pours one cup
function pourCup(): string {
  return 'cup';
}
`);
});
