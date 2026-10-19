import type { ReleaseAgeExclude } from './build-bunfig-with-excludes.ts';
import type { IgnoreChange } from './plan-audit-ignores.ts';
import type { FixedPackage } from './types.ts';

interface AuditFixSummaryInput {
  readonly fixes: readonly FixedPackage[];
  readonly excludes: readonly ReleaseAgeExclude[];

  // Packages whose audit-fix exclude the run dropped, because the release aged
  // past the gate.
  readonly expiredExcludes: readonly string[];
  readonly added: readonly IgnoreChange[];
  readonly renewed: readonly IgnoreChange[];
  readonly removed: readonly string[];
}

interface AuditFixSummary {
  // A Conventional Commit subject, used as the commit message and PR title;
  // empty when nothing changed.
  readonly title: string;
  readonly body: string;

  // True when the change adds or renews an ignore. The workflow labels such a
  // pull request audit-ignore and never merges it by itself.
  readonly needsReview: boolean;
}

export function renderAuditFixSummary(input: AuditFixSummaryInput): AuditFixSummary {
  const ignores = input.added.length + input.renewed.length;
  const needsReview = ignores > 0;

  const sections = [
    renderFixes(input.fixes),
    renderExcludes(input.excludes),
    renderIgnores('Ignored until a fix can land', input.added),
    renderIgnores('Ignores renewed, because no fix can land yet', input.renewed),
    renderRemoved(input.removed),
    renderExpiredExcludes(input.expiredExcludes),
  ].filter((section) => section !== '');

  const lead = needsReview
    ? 'The audit-fix workflow opened this pull request after it ran `bun audit` on the base branch. It ignores advisories that no fix reaches, so it waits for a person to review it and never merges by itself.'
    : 'The audit-fix workflow opened this pull request after it ran `bun audit` on the base branch.';

  const body = `${[lead, ...sections].join('\n\n')}\n`;

  if (input.fixes.length > 0) {
    return { title: buildFixTitle(input.fixes, ignores), body, needsReview };
  }

  if (ignores > 0) {
    return {
      title: `chore(deps): ignore ${ignores} unfixed audit ${formatNoun('advisory', ignores)}`,
      body,
      needsReview,
    };
  }

  if (input.removed.length > 0 || input.expiredExcludes.length > 0) {
    return {
      title: buildDropTitle(input.removed.length, input.expiredExcludes.length),
      body,
      needsReview,
    };
  }

  return { title: '', body: '', needsReview: false };
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

function renderExpiredExcludes(names: readonly string[]): string {
  if (names.length === 0) {
    return '';
  }

  return [
    '## Release-age excludes dropped, because each release aged past the gate',
    ...names.map((name) => `- \`${name}\``),
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

function formatNoun(noun: string, count: number): string {
  if (count === 1) {
    return noun;
  }

  return noun.endsWith('y') ? `${noun.slice(0, -1)}ies` : `${noun}s`;
}

function buildDropTitle(ignores: number, excludes: number): string {
  if (excludes === 0) {
    return `chore(deps): drop ${ignores} stale audit ${formatNoun('ignore', ignores)}`;
  }

  if (ignores === 0) {
    return `chore(deps): drop ${excludes} aged release-age ${formatNoun('exclude', excludes)}`;
  }

  return 'chore(deps): drop stale audit ignores and release-age excludes';
}
