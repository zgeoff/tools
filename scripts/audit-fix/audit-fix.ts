// The audit-fix step's entry point, which the audit-fix workflow runs in the
// caller's checkout; sync/README.md describes what it changes.
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { buildAuditScript } from './build-audit-script.ts';
import { buildBunfigWithExcludes } from './build-bunfig-with-excludes.ts';
import type { ReleaseAgeExclude } from './build-bunfig-with-excludes.ts';
import { buildDateAfter } from './build-date-after.ts';
import { parseAuditScript } from './parse-audit-script.ts';
import { planAuditIgnores } from './plan-audit-ignores.ts';
import { renderAuditFixSummary } from './render-audit-fix-summary.ts';
import type { AuditIgnores, AuditReport, FixPlan } from './types.ts';

const ignoresPath = 'audit-ignores.json';
const gateDays = 7;

export async function runAuditFix(argv: readonly string[]): Promise<void> {
  const args = parseArgs({
    args: [...argv],
    options: {
      'title-file': { type: 'string' },
      'body-file': { type: 'string' },
      'expiry-days': { type: 'string', default: '30' },
    },
  });

  const titleFile = args.values['title-file'];
  const bodyFile = args.values['body-file'];
  const expiryDays = Number(args.values['expiry-days']);

  if (titleFile === undefined || bodyFile === undefined || !Number.isInteger(expiryDays)) {
    throw new Error(
      'usage: audit-fix.ts --title-file <path> --body-file <path> [--expiry-days <n>]',
    );
  }

  requireAuditFix();

  const today = new Date().toISOString().slice(0, 10);

  const packageJSON = await readFile('package.json', 'utf8');

  const script = readAuditScript(packageJSON);
  const parsedScript = parseAuditScript(script);

  const ignores = await loadAuditIgnores();

  const unmanagedIDs = parsedScript.ignoreIDs.filter((id) => !(id in ignores));

  // An expired ignore is left out, so the fix tries the advisory again.
  const activeIDs = Object.entries(ignores)
    .filter(([, ignore]) => ignore.expires > today)
    .map(([id]) => id);

  const flags = [...activeIDs, ...unmanagedIDs].map((id) => `--ignore=${id}`);

  const beforeOutput = await runBun(['audit', '--json']);

  const before = parseJSONOutput<AuditReport>(beforeOutput);

  const planOutput = await runBun(['audit', 'fix', '--json', '--ignore-scripts', ...flags]);

  const plan = parseJSONOutput<FixPlan>(planOutput);

  const excludes = await collectReleaseAgeExcludes(plan, before, today);

  if (excludes.length > 0) {
    const bunfig = await readFile('bunfig.toml', 'utf8');

    await writeFile('bunfig.toml', buildBunfigWithExcludes(bunfig, excludes));
  }

  const reportOutput = await runBun(['audit', '--json']);

  const report = parseJSONOutput<AuditReport>(reportOutput);

  const ignorePlan = planAuditIgnores({
    report,
    ignores,
    unmanagedIDs,
    plan,
    auditLevel: parsedScript.auditLevel,
    today,
    expiryDays,
  });

  const nextScript = buildAuditScript(script, [
    ...Object.keys(ignorePlan.ignores),
    ...unmanagedIDs,
  ]);

  await writeAuditIgnores(ignorePlan.ignores);

  if (nextScript !== script) {
    await writeAuditScript(nextScript);
  }

  // The audit script now ignores what the fix left, so it must pass.
  await runBun(nextScript.split(' ').slice(1), { check: true });

  const summary = renderAuditFixSummary({
    fixes: plan.fixes,
    excludes,
    added: ignorePlan.added,
    renewed: ignorePlan.renewed,
    removed: ignorePlan.removed,
  });

  await writeFile(titleFile, summary.title);
  await writeFile(bodyFile, summary.body);
}

function requireAuditFix(): void {
  const [major = 0, minor = 0] = Bun.version.split('.').map(Number);

  if (major < 1 || (major === 1 && minor < 4)) {
    throw new Error(
      `audit-fix needs bun audit fix, which Bun 1.4.0 added; this repo's .bun-version gives Bun ${Bun.version}`,
    );
  }
}

function readAuditScript(packageJSON: string): string {
  const scripts = (JSON.parse(packageJSON) as { scripts?: Record<string, string> }).scripts;

  return scripts?.['audit'] ?? 'bun audit';
}

async function loadAuditIgnores(): Promise<AuditIgnores> {
  if (!existsSync(ignoresPath)) {
    return {};
  }

  const content = await readFile(ignoresPath, 'utf8');

  return JSON.parse(content) as AuditIgnores;
}

interface RunBunOptions {
  // Throw when bun exits non-zero. `bun audit` exits 1 while advisories remain,
  // which the JSON runs expect.
  readonly check?: boolean;
}

async function runBun(args: readonly string[], options: RunBunOptions = {}): Promise<string> {
  const run = Bun.spawn(['bun', ...args], { stdout: 'pipe', stderr: 'inherit' });

  const [stdout, exitCode] = await Promise.all([new Response(run.stdout).text(), run.exited]);

  if (options.check === true && exitCode !== 0) {
    process.stdout.write(stdout);
    throw new Error(`bun ${args.join(' ')} exited ${exitCode}`);
  }

  return stdout;
}

// The JSON object is the last line that starts with a brace; a lifecycle
// script or a version banner can print before it.
function parseJSONOutput<T>(stdout: string): T {
  const line = stdout
    .split('\n')
    .toReversed()
    .find((candidate) => candidate.startsWith('{'));

  if (line === undefined) {
    throw new Error(`bun printed no JSON:\n${stdout}`);
  }

  return JSON.parse(line) as T;
}

// `before` is the audit from before the fix, which still lists the advisories
// each fix patches.
function collectReleaseAgeExcludes(
  plan: FixPlan,
  before: AuditReport,
  today: string,
): Promise<ReleaseAgeExclude[]> {
  const young = plan.fixes.filter((fix) => fix.newerThanMinimumReleaseAge);

  return Promise.all(
    young.map(async (fix) => {
      const publishedOn = await readPublishDate(fix.name, fix.to, today);

      return {
        name: fix.name,
        version: fix.to,
        publishedOn,
        agesPastGateOn: buildDateAfter(publishedOn, gateDays),
        advisories: (before[fix.name] ?? []).map(
          (advisory) => advisory.url.split('/').at(-1) ?? '',
        ),
      };
    }),
  );
}

async function readPublishDate(name: string, version: string, today: string): Promise<string> {
  const response = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}`);

  if (!response.ok) {
    // Without the date, today is the latest the release can be from.
    return today;
  }

  const manifest = (await response.json()) as { time?: Record<string, string> };

  return manifest.time?.[version]?.slice(0, 10) ?? today;
}

async function writeAuditIgnores(ignores: AuditIgnores): Promise<void> {
  if (Object.keys(ignores).length === 0) {
    await rm(ignoresPath, { force: true });

    return;
  }

  await writeFile(ignoresPath, `${JSON.stringify(ignores, null, 2)}\n`);
}

// Replaces the audit script's value in place, so the rest of package.json
// keeps its formatting; a package.json with no audit script gets one.
async function writeAuditScript(script: string): Promise<void> {
  const packageJSON = await readFile('package.json', 'utf8');

  const entry = /(?<key>"audit"\s*:\s*)"(?:[^"\\]|\\.)*"/u;

  if (entry.test(packageJSON)) {
    await writeFile('package.json', packageJSON.replace(entry, `$<key>${JSON.stringify(script)}`));

    return;
  }

  const parsed = JSON.parse(packageJSON) as { scripts?: Record<string, string> };

  parsed.scripts = { ...parsed.scripts, audit: script };

  await writeFile('package.json', `${JSON.stringify(parsed, null, 2)}\n`);
}

if (import.meta.main) {
  await runAuditFix(process.argv.slice(2));
}
