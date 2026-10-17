// The shapes the audit-fix step reads from `bun audit --json` and
// `bun audit fix --json`, and the shape of the audit-ignores.json it keeps.

export type Severity = 'low' | 'moderate' | 'high' | 'critical';

// Lowest first, so an index compares two severities.
export const severities: readonly Severity[] = ['low', 'moderate', 'high', 'critical'];

export interface Advisory {
  readonly id: number;
  readonly url: string;
  readonly title: string;
  readonly severity: Severity;
  readonly vulnerable_versions: string;
}

// `bun audit --json` maps each vulnerable package name to its advisories. The
// report is unfiltered: it holds the advisories that --ignore and
// --audit-level leave out of the exit code.
export type AuditReport = Readonly<Record<string, readonly Advisory[]>>;

export interface FixedPackage {
  readonly name: string;
  readonly from: string;
  readonly to: string;
  readonly newerThanMinimumReleaseAge: boolean;
}

export interface BlockedPackage {
  readonly name: string;
  readonly from: string;
  readonly to: string;
  readonly blockers: readonly { readonly dependent: string; readonly range: string }[];
}

export interface UnfixablePackage {
  readonly name: string;
}

// The parts of `bun audit fix --json` the step uses.
export interface FixPlan {
  readonly fixes: readonly FixedPackage[];
  readonly blocked: readonly BlockedPackage[];
  readonly unfixable: readonly UnfixablePackage[];
}

export interface AuditIgnore {
  readonly package: string;
  readonly reason: string;

  // An ISO date. On and after it, the step audits the advisory again.
  readonly expires: string;
}

// audit-ignores.json maps an advisory ID (a GHSA ID, or bun's numeric ID when
// the advisory has none) to why the repo ignores it and until when.
export type AuditIgnores = Readonly<Record<string, AuditIgnore>>;
