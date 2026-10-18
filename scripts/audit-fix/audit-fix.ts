// The audit-fix step's entry point, which the audit-fix workflow runs in the
// caller's checkout; sync/README.md describes what it changes.
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { isRecord } from '../../packages/std/src/is-record.ts';
import { buildAuditScript } from './build-audit-script.ts';
import { buildBunfigWithExcludes } from './build-bunfig-with-excludes.ts';
import type { ReleaseAgeExclude } from './build-bunfig-with-excludes.ts';
import { buildBunfigWithoutExpiredExcludes } from './build-bunfig-without-expired-excludes.ts';
import { buildDateAfter } from './build-date-after.ts';
import { parseAuditIgnores } from './parse-audit-ignores.ts';
import { parseAuditReport } from './parse-audit-report.ts';
import { parseAuditScript } from './parse-audit-script.ts';
import { parseFixPlan } from './parse-fix-plan.ts';
import { parseJSONLine } from './parse-json-line.ts';
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
      'review-file': { type: 'string' },
      'pending-ignores': { type: 'string' },
      'expiry-days': { type: 'string', default: '30' },
    },
  });

  const titleFile = args.values['title-file'];
  const bodyFile = args.values['body-file'];
  const reviewFile = args.values['review-file'];
  const pendingPath = args.values['pending-ignores'];
  const expiryDays = Number(args.values['expiry-days']);

  if (
    titleFile === undefined ||
    bodyFile === undefined ||
    reviewFile === undefined ||
    !Number.isInteger(expiryDays) ||
    expiryDays < 1 ||
    expiryDays > 90
  ) {
    throw new Error(
      'usage: audit-fix.ts --title-file <path> --body-file <path> --review-file <path> [--pending-ignores <path>] [--expiry-days <1-90>]',
    );
  }

  requireAuditFix();

  const today = new Date().toISOString().slice(0, 10);

  const packageJSON = await readFile('package.json', 'utf8');

  const script = readAuditScript(packageJSON);
  const parsedScript = parseAuditScript(script);

  const ignores = await loadAuditIgnores(ignoresPath);

  const pending = pendingPath === undefined ? {} : await loadAuditIgnores(pendingPath);
  const latest = buildDateAfter(today, 90);
  const unmanagedIDs = parsedScript.ignoreIDs.filter((id) => !(id in ignores));

  // An expired ignore, or one set past the 90-day cap, is left out, so the fix
  // tries the advisory again.
  const activeIDs = Object.entries(ignores)
    .filter(([, ignore]) => ignore.expires > today && ignore.expires <= latest)
    .map(([id]) => id);

  const flags = [...activeIDs, ...unmanagedIDs].map((id) => `--ignore=${id}`);

  const beforeOutput = await runBun(['audit', '--json']);

  const before = parseAuditReport(parseJSONLine(beforeOutput));

  const planOutput = await runBun(['audit', 'fix', '--json', '--ignore-scripts', ...flags]);

  const plan = parseFixPlan(parseJSONLine(planOutput));

  const excludes = await collectReleaseAgeExcludes(plan, before, today);
  const expiredExcludes = await updateReleaseAgeExcludes(excludes, today);
  const reportOutput = await runBun(['audit', '--json']);

  const report = parseAuditReport(parseJSONLine(reportOutput));

  const ignorePlan = planAuditIgnores({
    report,
    ignores,
    unmanagedIDs,
    plan,
    auditLevel: parsedScript.auditLevel,
    today,
    expiryDays,
    pending,
  });

  const nextIDs = [...Object.keys(ignorePlan.ignores), ...unmanagedIDs];

  // The script keeps its spelling while its ignores stay the same, so a run
  // with nothing to fix leaves package.json alone.
  const isScriptChanged = !hasSameIDs(parsedScript.ignoreIDs, nextIDs);
  const nextScript = isScriptChanged ? buildAuditScript(script, nextIDs) : script;

  await writeAuditIgnores(ignorePlan.ignores);

  if (isScriptChanged) {
    await writeAuditScript(nextScript);
  }

  // The audit script now ignores what the fix left, so it must pass.
  await runBun(nextScript.split(' ').slice(1), { check: true });

  const summary = renderAuditFixSummary({
    fixes: plan.fixes,
    excludes,
    expiredExcludes,
    added: ignorePlan.added,
    renewed: ignorePlan.renewed,
    removed: ignorePlan.removed,
  });

  await writeFile(titleFile, summary.title);
  await writeFile(bodyFile, summary.body);
  await writeFile(reviewFile, String(summary.needsReview));
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
  const parsed: unknown = JSON.parse(packageJSON);
  const scripts = isRecord(parsed) ? parsed['scripts'] : undefined;
  const audit = isRecord(scripts) ? scripts['audit'] : undefined;

  return typeof audit === 'string' ? audit : 'bun audit';
}

function hasSameIDs(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  return leftSet.size === rightSet.size && [...leftSet].every((id) => rightSet.has(id));
}

async function loadAuditIgnores(path: string): Promise<AuditIgnores> {
  if (!existsSync(path)) {
    return {};
  }

  const content = await readFile(path, 'utf8');

  const parsed: unknown = JSON.parse(content);

  return parseAuditIgnores(parsed);
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

// Drops each audit-fix exclude whose release aged past the gate, then adds the
// new ones; returns the dropped package names.
async function updateReleaseAgeExcludes(
  excludes: readonly ReleaseAgeExclude[],
  today: string,
): Promise<readonly string[]> {
  if (!existsSync('bunfig.toml')) {
    return [];
  }

  const bunfig = await readFile('bunfig.toml', 'utf8');

  const pruned = buildBunfigWithoutExpiredExcludes(bunfig, today);

  const next =
    excludes.length > 0 ? buildBunfigWithExcludes(pruned.bunfig, excludes) : pruned.bunfig;

  if (next !== bunfig) {
    await writeFile('bunfig.toml', next);
  }

  // A package dropped and added again in one run keeps its exclude.
  return pruned.removed.filter((name) => !excludes.some((exclude) => exclude.name === name));
}

async function readPublishDate(name: string, version: string, today: string): Promise<string> {
  const response = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}`);

  if (!response.ok) {
    // Without the date, today is the latest the release can be from.
    return today;
  }

  const manifest: unknown = await response.json();

  const time = isRecord(manifest) ? manifest['time'] : undefined;
  const published = isRecord(time) ? time[version] : undefined;

  return typeof published === 'string' ? published.slice(0, 10) : today;
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

  const parsed: unknown = JSON.parse(packageJSON);

  if (!isRecord(parsed)) {
    throw new TypeError('package.json holds no object');
  }

  const scripts = isRecord(parsed['scripts']) ? parsed['scripts'] : {};

  await writeFile(
    'package.json',
    `${JSON.stringify({ ...parsed, scripts: { ...scripts, audit: script } }, null, 2)}\n`,
  );
}

if (import.meta.main) {
  await runAuditFix(process.argv.slice(2));
}
