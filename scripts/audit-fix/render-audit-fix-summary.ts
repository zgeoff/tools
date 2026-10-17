import type { ReleaseAgeExclude } from './build-bunfig-with-excludes.ts';
import type { IgnoreChange } from './plan-audit-ignores.ts';
import type { FixedPackage } from './types.ts';

interface AuditFixSummaryInput {
  readonly fixes: readonly FixedPackage[];
  readonly excludes: readonly ReleaseAgeExclude[];
  readonly added: readonly IgnoreChange[];
  readonly renewed: readonly IgnoreChange[];
  readonly removed: readonly string[];
}

interface AuditFixSummary {
  // A Conventional Commit subject, used as the commit message and PR title.
  readonly title: string;
  readonly body: string;

  // `fix` when the change updates a package, `ignore` when it only records
  // ignores, and `none` when nothing changed.
  readonly kind: 'fix' | 'ignore' | 'none';
}

export function renderAuditFixSummary(input: AuditFixSummaryInput): AuditFixSummary {
  const ignores = input.added.length + input.renewed.length;

  const sections = [
    renderFixes(input.fixes),
    renderExcludes(input.excludes),
    renderIgnores('Ignored until a fix can land', input.added),
    renderIgnores('Ignores renewed, because no fix can land yet', input.renewed),
    renderRemoved(input.removed),
  ].filter((section) => section !== '');

  const body = [
    'The audit-fix workflow opened this pull request after it ran `bun audit` on the base branch.',
    ...sections,
  ].join('\n\n');

  if (input.fixes.length > 0) {
    return { title: buildFixTitle(input.fixes, ignores), body: `${body}\n`, kind: 'fix' };
  }

  if (ignores > 0 || input.removed.length > 0) {
    return {
      title: buildIgnoreTitle(ignores, input.removed.length),
      body: `${body}\n`,
      kind: 'ignore',
    };
  }

  return { title: '', body: '', kind: 'none' };
}

function renderFixes(fixes: readonly FixedPackage[]): string {
  if (fixes.length === 0) {
    return '';
  }

  const rows = fixes.map((fix) => `- \`${fix.name}\` ${fix.from} → ${fix.to}`);

  return ['## Updated to a fixed release', ...rows].join('\n');
}

function renderExcludes(excludes: readonly ReleaseAgeExclude[]): string {
  if (excludes.length === 0) {
    return '';
  }

  const rows = excludes.map(
    (exclude) =>
      `- \`${exclude.name}\` ${exclude.version}, published ${exclude.publishedOn}; remove the exclude on or after ${exclude.agesPastGateOn}`,
  );

  return [
    '## Release-age excludes',
    'These fixes are younger than `minimumReleaseAge`, so `bunfig.toml` excludes them from the gate until they age past it.',
    ...rows,
  ].join('\n');
}

function renderIgnores(heading: string, changes: readonly IgnoreChange[]): string {
  if (changes.length === 0) {
    return '';
  }

  const rows = changes.map(
    (change) =>
      `- ${change.advisory} in \`${change.package}\` (${change.title}), until ${change.expires}: ${change.reason}`,
  );

  return [`## ${heading}`, ...rows].join('\n');
}

function renderRemoved(removed: readonly string[]): string {
  if (removed.length === 0) {
    return '';
  }

  return [
    '## Ignores dropped, because the audit no longer reports them',
    ...removed.map((id) => `- ${id}`),
  ].join('\n');
}

// commitlint's header-max-length rule allows 72 characters, and a squash merge
// makes the title the commit subject.
const maxTitleLength = 72;

function buildFixTitle(fixes: readonly FixedPackage[], ignores: number): string {
  const names = [...new Set(fixes.map((fix) => fix.name))];

  const suffix =
    ignores > 0
      ? `, ignore ${ignores} unfixed ${formatNoun('advisory', ignores)}`
      : ' to fix advisories';

  const title = `fix(deps): update ${names.join(', ')}${suffix}`;

  if (title.length <= maxTitleLength) {
    return title;
  }

  return `fix(deps): update ${names.length} ${formatNoun('package', names.length)}${suffix}`;
}

function buildIgnoreTitle(ignores: number, removed: number): string {
  if (ignores === 0) {
    return `chore(deps): drop ${removed} stale audit ${formatNoun('ignore', removed)}`;
  }

  return `chore(deps): ignore ${ignores} unfixed audit ${formatNoun('advisory', ignores)}`;
}

function formatNoun(noun: string, count: number): string {
  if (count === 1) {
    return noun;
  }

  return noun.endsWith('y') ? `${noun.slice(0, -1)}ies` : `${noun}s`;
}
