import { hexSha } from './hex-sha.ts';
import type { BodySection } from './parse-pr-body.ts';
import { parsePrBody, toSectionName } from './parse-pr-body.ts';
import { proseCheckLine } from './prose-check-line.ts';
import { stripPrBody } from './strip-pr-body.ts';
import type { BranchFacts } from './types.ts';

// Returns one line per error, each naming the section and the fix. An empty list is a pass. The
// facts come from git, and without them the sha checks and the missing-section check do not run.
export function collectPrBodyErrors(body: string, facts?: BranchFacts): string[] {
  const stripped = stripPrBody(body.replaceAll('\r\n', '\n'));
  const parsed = parsePrBody(stripped.text);
  const named = parsed.sections.filter((section) => section.heading !== undefined);

  return [
    ...collectHeadingErrors(named, stripped.hasReport),
    ...collectCodeBlockErrors(parsed.codeBlocks),
    ...collectChecksFenceErrors(parsed.codeBlocks),
    ...collectPlaceholderErrors(parsed.sections),
    ...named.flatMap((section) =>
      section.heading === 'Next steps' ? collectNextStepsErrors(section) : [],
    ),
    ...named.flatMap((section) =>
      section.heading === 'Checks' ? collectChecksErrors(section, facts) : [],
    ),
    ...collectMissingChecksErrors(named, facts),
  ];
}

const headingOrder: readonly string[] = ['Description', 'Next steps', 'Checks', 'Verification'];

function collectHeadingErrors(sections: readonly BodySection[], hasReport: boolean): string[] {
  const errors: string[] = [];
  let lastIndex = -1;

  for (const section of sections) {
    const index = headingOrder.indexOf(section.heading ?? '');

    if (index === -1) {
      errors.push(
        `${toSectionName(section.heading)}: "## ${section.heading}" is not an allowed heading; use ${headingOrder.join(', ')}, in that order, or move the text into Description.`,
      );
    } else if (index <= lastIndex) {
      errors.push(
        `${section.heading}: the heading is out of order or repeated; the sections go ${headingOrder.join(', ')}, once each.`,
      );
    } else {
      lastIndex = index;
    }

    if (index !== -1 && !section.isFilled && !(section.heading === 'Verification' && hasReport)) {
      errors.push(`${section.heading}: the section is empty; write it or delete the heading.`);
    }
  }

  if (!sections.some((section) => section.heading === 'Description')) {
    errors.push('Description: the body has no "## Description" section; add one.');
  }

  return errors;
}

const maxCodeLines = 50;
const maxCodeWidth = 100;

function collectCodeBlockErrors(
  blocks: readonly { section: string; lines: readonly string[]; isClosed: boolean }[],
): string[] {
  return blocks.flatMap((block) => {
    const errors: string[] = [];

    if (!block.isClosed) {
      errors.push(`${block.section}: a code block is never closed; add the closing fence.`);
    }

    if (block.lines.length > maxCodeLines) {
      errors.push(
        `${block.section}: a code block runs ${block.lines.length} lines; cut it to ${maxCodeLines} or fewer, or link to the code.`,
      );
    }

    const widest = Math.max(0, ...block.lines.map((line) => (line.match(/./gsu) ?? []).length));

    if (widest > maxCodeWidth) {
      errors.push(
        `${block.section}: a code block has a line ${widest} characters wide; wrap it to ${maxCodeWidth} or fewer.`,
      );
    }

    return errors;
  });
}

function collectChecksFenceErrors(blocks: readonly { section: string }[]): string[] {
  return blocks
    .filter((block) => block.section === 'Checks')
    .map(
      () =>
        'Checks: a code block sits under Checks; the section holds only the chex, Deslop and Cold read lines, so move the block to Verification or Description.',
    );
}

const htmlTags = new Set([
  'details',
  'summary',
  'br',
  'hr',
  'kbd',
  'sub',
  'sup',
  'img',
  'a',
  'p',
  'b',
  'i',
  'em',
  'strong',
  'code',
  'pre',
]);

const placeholder = /<(?<word>[A-Za-z][A-Za-z0-9_-]*)?>/gu;

function collectPlaceholderErrors(sections: readonly BodySection[]): string[] {
  return sections.flatMap((section) => {
    const found = new Set<string>();

    for (const line of section.lines) {
      for (const match of line.matchAll(placeholder)) {
        const word = match.groups?.['word'] ?? '';

        if (!htmlTags.has(word.toLowerCase())) {
          found.add(match[0]);
        }
      }
    }

    return [...found].map(
      (item) =>
        `${toSectionName(section.heading)}: the placeholder ${item} is still in the text; replace it with a real value or delete the line.`,
    );
  });
}

const labelOrder: readonly string[] = ['Needs the owner', 'Later'];
const labelLine = /^\*\*(?<label>[^*]+)\*\*:?\s*$/u;
const bulletLine = /^[-*+]\s+/u;
const checkboxBullet = /^[-*+]\s+\[[ xX]\]\s+\S/u;
const issueEnding = /\((?:[A-Z][A-Z0-9]*-\d+|#\d+|[\w.-]+\/[\w.-]+#\d+)\)\.?$/u;

function collectNextStepsErrors(section: BodySection): string[] {
  const errors: string[] = [];
  const groups: { label: string; items: string[] }[] = [];
  let lastLabelIndex = -1;

  for (const line of section.lines.filter((text) => text.trim() !== '')) {
    const label = labelLine.exec(line)?.groups?.['label']?.trim();
    const group = groups.at(-1);

    if (label !== undefined) {
      const index = labelOrder.indexOf(label);

      if (index === -1) {
        errors.push(
          `Next steps: the label **${label}** is not allowed; use **Needs the owner** or **Later**.`,
        );
      } else if (index <= lastLabelIndex) {
        errors.push(
          `Next steps: **${label}** is out of order or repeated; the labels go **Needs the owner**, then **Later**, once each.`,
        );
      } else {
        lastLabelIndex = index;
      }

      groups.push({ label, items: [] });
    } else if (bulletLine.test(line)) {
      if (group === undefined) {
        errors.push(
          `Next steps: the bullet "${line.trim()}" has no label above it; put it under **Needs the owner** or **Later**.`,
        );
      } else {
        group.items.push(line);
      }
    } else if (/^\s/u.test(line) && group !== undefined && group.items.length > 0) {
      group.items[group.items.length - 1] += ` ${line.trim()}`;
    } else {
      errors.push(
        `Next steps: "${line.trim()}" is not a label or a bullet; write **Needs the owner** or **Later** on its own line and the items as bullets under it.`,
      );
    }
  }

  for (const group of groups) {
    if (group.items.length === 0) {
      errors.push(`Next steps: **${group.label}** has no bullets; add them or delete the label.`);
    }

    for (const item of group.items) {
      if (group.label === 'Needs the owner' && !checkboxBullet.test(item)) {
        errors.push(
          `Next steps: "${item.trim()}" under **Needs the owner** is not a checkbox; start it with "- [ ] ".`,
        );
      }

      if (group.label === 'Later' && !issueEnding.test(item.trim())) {
        errors.push(
          `Next steps: "${item.trim()}" under **Later** does not end with an issue ID in brackets such as (GEO-124) or (#45); file the issue and add it.`,
        );
      }
    }
  }

  return errors;
}

const placeholderOnly = /^<[A-Za-z0-9_-]*>$/u;
const chexLine = /^- \[[ x]\] chex$/u;

function collectChecksErrors(section: BodySection, facts: BranchFacts | undefined): string[] {
  return section.lines
    .filter((line) => line.trim() !== '')
    .flatMap((line) => {
      if (chexLine.test(line)) {
        return [];
      }

      const check = proseCheckLine.exec(line)?.groups;

      if (check === undefined) {
        return [
          `Checks: "${line.trim()}" is not a check line; use "- [ ] chex", "- [x] Deslop (<sha>)" or "- [x] Cold read (<sha>)".`,
        ];
      }

      const name = check['name'] ?? '';
      const sha = check['sha'] ?? '';

      if (check['ticked'] !== 'x') {
        return [`Checks: ${name} is not ticked; run it, then tick it with the commit you checked.`];
      }

      // A placeholder sha is reported as a placeholder.
      if (placeholderOnly.test(sha)) {
        return [];
      }

      if (!hexSha.test(sha)) {
        return [
          `Checks: ${name} (${sha}) is not a commit hash; write the short hash of the commit you checked.`,
        ];
      }

      return facts === undefined ? [] : collectShaErrors(name, sha, facts);
    });
}

function collectShaErrors(name: string, sha: string, facts: BranchFacts): string[] {
  const state = facts.shaStates[sha] ?? 'unknown';

  if (state === 'unknown') {
    return [
      `Checks: ${name} (${sha}) is not a commit in this repo; write the short hash of the commit you checked.`,
    ];
  }

  if (state === 'outside') {
    return [
      `Checks: ${name} (${sha}) is not in this branch's history; re-run the check on the branch and update the sha.`,
    ];
  }

  if (state === 'old' && facts.newestDocChange !== undefined) {
    return [
      `Checks: ${name} (${sha}) is older than commit ${facts.newestDocChange.commit.slice(0, 7)}, which changes ${facts.newestDocChange.files.join(', ')}; re-run that check and update the sha.`,
    ];
  }

  return [];
}

function collectMissingChecksErrors(
  sections: readonly BodySection[],
  facts: BranchFacts | undefined,
): string[] {
  if (facts === undefined || facts.docFiles.length === 0) {
    return [];
  }

  if (sections.some((section) => section.heading === 'Checks')) {
    return [];
  }

  return [
    `Checks: the PR changes doc or skill files (${facts.docFiles.join(', ')}) but the body has no "## Checks" section; add one with the chex, Deslop and Cold read lines.`,
  ];
}
