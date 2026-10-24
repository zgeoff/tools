import { buildDateAfter } from './build-date-after.ts';
import { severities } from './types.ts';
import type { AuditIgnore, AuditIgnores, AuditReport, FixPlan, Severity } from './types.ts';

interface PlanAuditIgnoresInput {
  readonly report: AuditReport;
  readonly ignores: AuditIgnores;

  readonly unmanagedIDs: readonly string[];
  readonly plan: FixPlan;
  readonly auditLevel: Severity | null;
  readonly today: string;
  readonly expiryDays: number;

  // A rerun that builds the same tree leaves the pull request's checks alone.
  readonly pending: AuditIgnores;
}

const maxExpiryDays = 90;

export interface IgnoreChange extends AuditIgnore {
  readonly advisory: string;
  readonly title: string;
}

interface AuditIgnoresPlan {
  readonly ignores: AuditIgnores;
  readonly added: readonly IgnoreChange[];
  readonly renewed: readonly IgnoreChange[];

  readonly removed: readonly string[];
}

export function planAuditIgnores(input: PlanAuditIgnoresInput): AuditIgnoresPlan {
  const remaining = collectRemainingAdvisories(input.report, input.auditLevel);
  const latest = buildDateAfter(input.today, maxExpiryDays);
  const fallback = buildDateAfter(input.today, Math.min(input.expiryDays, maxExpiryDays));
  const isLive = (expires: string): boolean => expires > input.today && expires <= latest;

  const pickExpiry = (advisoryID: string): string => {
    const pending = input.pending[advisoryID]?.expires;

    return pending !== undefined && isLive(pending) ? pending : fallback;
  };

  const ignores: Record<string, AuditIgnore> = {};
  const added: IgnoreChange[] = [];
  const renewed: IgnoreChange[] = [];
  const removed: string[] = [];

  for (const [advisoryID, ignore] of Object.entries(input.ignores)) {
    const advisory = remaining.get(advisoryID);

    if (advisory === undefined) {
      removed.push(advisoryID);
    } else if (isLive(ignore.expires)) {
      ignores[advisoryID] = ignore;
    } else {
      const change = buildIgnoreChange(advisoryID, advisory, input.plan, pickExpiry(advisoryID));

      ignores[advisoryID] = toAuditIgnore(change);

      renewed.push(change);
    }
  }

  for (const [advisoryID, advisory] of remaining) {
    if (!(advisoryID in input.ignores) && !input.unmanagedIDs.includes(advisoryID)) {
      const change = buildIgnoreChange(advisoryID, advisory, input.plan, pickExpiry(advisoryID));

      ignores[advisoryID] = toAuditIgnore(change);

      added.push(change);
    }
  }

  return { ignores: sortIgnores(ignores), added, renewed, removed };
}

interface RemainingAdvisory {
  readonly packageName: string;
  readonly title: string;
}

function collectRemainingAdvisories(
  report: AuditReport,
  auditLevel: Severity | null,
): Map<string, RemainingAdvisory> {
  const remaining = new Map<string, RemainingAdvisory>();

  for (const [packageName, advisories] of Object.entries(report)) {
    for (const advisory of advisories) {
      if (isAtOrAboveLevel(advisory.severity, auditLevel)) {
        remaining.set(getAdvisoryID(advisory.url, advisory.id), {
          packageName,
          title: advisory.title,
        });
      }
    }
  }

  return remaining;
}

function isAtOrAboveLevel(severity: Severity, level: Severity | null): boolean {
  return level === null || severities.indexOf(severity) >= severities.indexOf(level);
}

// bun audit --ignore takes a GHSA ID or the numeric advisory ID.
function getAdvisoryID(url: string, id: number): string {
  return /GHSA(?:-[\da-z]{4}){3}/u.exec(url)?.[0] ?? String(id);
}

function buildIgnoreChange(
  advisoryID: string,
  advisory: RemainingAdvisory,
  plan: FixPlan,
  expires: string,
): IgnoreChange {
  return {
    advisory: advisoryID,
    title: advisory.title,
    package: advisory.packageName,
    reason: buildIgnoreReason(advisory.packageName, plan),
    expires,
  };
}

function buildIgnoreReason(packageName: string, plan: FixPlan): string {
  const blocked = plan.blocked.find((entry) => entry.name === packageName);

  if (blocked !== undefined) {
    const blockers = blocked.blockers
      .map((blocker) => `${blocker.dependent} accepts only ${blocker.range}`)
      .join('; ');

    return `The fix is ${packageName} ${blocked.to}, but ${blockers}.`;
  }

  if (plan.unfixable.some((entry) => entry.name === packageName)) {
    return `No published release of ${packageName} fixes it.`;
  }

  return `bun audit fix found no fix for ${packageName} that it could apply.`;
}

function toAuditIgnore(change: IgnoreChange): AuditIgnore {
  return { package: change.package, reason: change.reason, expires: change.expires };
}

function sortIgnores(ignores: Record<string, AuditIgnore>): AuditIgnores {
  return Object.fromEntries(
    Object.entries(ignores).toSorted(([left], [right]) => left.localeCompare(right)),
  );
}
