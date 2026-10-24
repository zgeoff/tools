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

// `bun audit --json` lists the advisories that --ignore and --audit-level
// leave out of the exit code.
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

export interface FixPlan {
  readonly fixes: readonly FixedPackage[];
  readonly blocked: readonly BlockedPackage[];
  readonly unfixable: readonly UnfixablePackage[];
}

export interface AuditIgnore {
  readonly package: string;
  readonly reason: string;

  readonly expires: string;
}

// An advisory ID is its GHSA ID, or bun's numeric ID when the advisory has none.
export type AuditIgnores = Readonly<Record<string, AuditIgnore>>;
