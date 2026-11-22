import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { collectPrBodyErrors } from './collect-pr-body-errors.ts';
import type { BranchFacts } from './types.ts';

function setupTest() {
  const validBody = `## Description

Fixes GEO-123

A job that kept failing retried forever. Each job now has a retry budget.

- A job retries up to 5 times by default, then parks.

\`\`\`ts
type RetryPolicy = { budget: number }  // default 5
\`\`\`

## Next steps

**Needs the owner**
- [ ] Decide whether parked jobs expire after 30 days.

**Later**
- A requeue button for parked jobs (GEO-124).
- A digest of parked jobs (zgeoff/atc#12).
`;

  const emptyFacts: BranchFacts = { docFiles: [], newestDocChange: undefined, shaStates: {} };
  const intro = '## Description\n\nA retry budget.\n\n';

  const buildFacts = (overrides: Partial<BranchFacts> = {}): BranchFacts => ({
    ...emptyFacts,
    ...overrides,
  });

  const buildBody = (sections: string): string => `${intro}${sections}`;

  return { validBody, buildFacts, buildBody };
}

test('it passes a valid body', () => {
  const ctx = setupTest();

  expect(collectPrBodyErrors(ctx.validBody)).toStrictEqual([]);
});

test('it passes the template once Description is written and the optional sections are gone', () => {
  const template = readFileSync(
    new URL('../../../../.github/PULL_REQUEST_TEMPLATE.md', import.meta.url),
    'utf8',
  );

  const filled = template
    .replace('## Description\n', '## Description\n\nA retry budget.\n')
    .replace(/## Next steps[\s\S]*?(?=## Verification)/u, '');

  expect(collectPrBodyErrors(filled)).toStrictEqual([]);
});

test('it reports the empty sections of the unedited template', () => {
  const template = readFileSync(
    new URL('../../../../.github/PULL_REQUEST_TEMPLATE.md', import.meta.url),
    'utf8',
  );

  expect(collectPrBodyErrors(template)).toStrictEqual([
    'Description: the section is empty; write it or delete the heading.',
    'Next steps: the section is empty; write it or delete the heading.',
    'Checks: the section is empty; write it or delete the heading.',
  ]);
});

test('it ignores a heading and a code fence inside an HTML comment', () => {
  const ctx = setupTest();
  const body = ctx.buildBody('<!--\n## Summary\n```ts\nunclosed\n-->\n');

  expect(collectPrBodyErrors(body)).toStrictEqual([]);
});

test('it counts a Verification section with the verify report markers as filled', () => {
  const ctx = setupTest();

  const body = ctx.buildBody(
    '## Verification\n\n<!-- wringer:report -->\n| step | result |\n| --- | --- |\n<!-- /wringer:report -->\n',
  );

  expect(collectPrBodyErrors(body)).toStrictEqual([]);
});

test('it fails an empty Verification section with no report', () => {
  const ctx = setupTest();

  expect(collectPrBodyErrors(ctx.buildBody('## Verification\n\n'))).toStrictEqual([
    'Verification: the section is empty; write it or delete the heading.',
  ]);
});

test('it fails a Summary heading and names the allowed ones', () => {
  expect(collectPrBodyErrors('## Summary\n\nA retry budget.\n')).toStrictEqual([
    'Summary: "## Summary" is not an allowed heading; use Description, Next steps, Checks, Verification, in that order, or move the text into Description.',
    'Description: the body has no "## Description" section; add one.',
  ]);
});

test('it fails headings out of order', () => {
  const body =
    '## Description\n\nText.\n\n## Checks\n\n- [ ] chex\n\n## Next steps\n\n**Later**\n- Idea (#4)\n';

  expect(collectPrBodyErrors(body)).toStrictEqual([
    'Next steps: the heading is out of order or repeated; the sections go Description, Next steps, Checks, Verification, once each.',
  ]);
});

test('it fails a verify table pasted under Checks', () => {
  const ctx = setupTest();

  const body = ctx.buildBody(
    '## Checks\n\n| step | result |\n| --- | --- |\n| typecheck | pass |\n',
  );

  expect(collectPrBodyErrors(body)).toStrictEqual([
    'Checks: "| step | result |" is not a check line; use "- [ ] chex", "- [x] Deslop (<sha>)" or "- [x] Cold read (<sha>)".',
    'Checks: "| --- | --- |" is not a check line; use "- [ ] chex", "- [x] Deslop (<sha>)" or "- [x] Cold read (<sha>)".',
    'Checks: "| typecheck | pass |" is not a check line; use "- [ ] chex", "- [x] Deslop (<sha>)" or "- [x] Cold read (<sha>)".',
  ]);
});

test('it fails a Later line written as prose with no label and no ID', () => {
  const ctx = setupTest();
  const body = ctx.buildBody('## Next steps\n\nLater: add a requeue button for parked jobs.\n');

  expect(collectPrBodyErrors(body)).toStrictEqual([
    'Next steps: "Later: add a requeue button for parked jobs." is not a label or a bullet; write **Needs the owner** or **Later** on its own line and the items as bullets under it.',
  ]);
});

test('it fails a Later bullet with no issue ID', () => {
  const ctx = setupTest();
  const body = ctx.buildBody('## Next steps\n\n**Later**\n- A requeue button for parked jobs.\n');

  expect(collectPrBodyErrors(body)).toStrictEqual([
    'Next steps: "- A requeue button for parked jobs." under **Later** does not end with an issue ID in brackets such as (GEO-124) or (#45); file the issue and add it.',
  ]);
});

test.each([['(GEO-124)'], ['(GEO-124).'], ['(#45)'], ['(zgeoff/atc#12)']])(
  'it accepts a Later bullet that ends with %s',
  (id) => {
    const ctx = setupTest();
    const body = ctx.buildBody(`## Next steps\n\n**Later**\n- A requeue button ${id}\n`);

    expect(collectPrBodyErrors(body)).toStrictEqual([]);
  },
);

test('it fails a Needs the owner bullet that is not a checkbox', () => {
  const ctx = setupTest();
  const body = ctx.buildBody('## Next steps\n\n**Needs the owner**\n- Decide on expiry.\n');

  expect(collectPrBodyErrors(body)).toStrictEqual([
    'Next steps: "- Decide on expiry." under **Needs the owner** is not a checkbox; start it with "- [ ] ".',
  ]);
});

test('it fails an unknown label, a label with no bullets and labels out of order', () => {
  const ctx = setupTest();

  const body = ctx.buildBody(
    '## Next steps\n\n**Later**\n- Idea (#4)\n\n**Needs the owner**\n\n**Follow-up**\n- [ ] Thing\n',
  );

  expect(collectPrBodyErrors(body)).toStrictEqual([
    'Next steps: **Needs the owner** is out of order or repeated; the labels go **Needs the owner**, then **Later**, once each.',
    'Next steps: the label **Follow-up** is not allowed; use **Needs the owner** or **Later**.',
    'Next steps: **Needs the owner** has no bullets; add them or delete the label.',
  ]);
});

test('it fails template placeholders left in the text', () => {
  const ctx = setupTest();

  const body = ctx.buildBody(
    'Reviewed with <model> in <commit>, see `<n>` for a count, <details>kept</details>.\n',
  );

  expect(collectPrBodyErrors(body)).toStrictEqual([
    'Description: the placeholder <model> is still in the text; replace it with a real value or delete the line.',
    'Description: the placeholder <commit> is still in the text; replace it with a real value or delete the line.',
    'Description: the placeholder <n> is still in the text; replace it with a real value or delete the line.',
  ]);
});

test('it fails a placeholder wrapped in inline code', () => {
  const ctx = setupTest();
  const body = ctx.buildBody('Reviewed in `<commit>`.\n');

  expect(collectPrBodyErrors(body)).toStrictEqual([
    'Description: the placeholder <commit> is still in the text; replace it with a real value or delete the line.',
  ]);
});

test('it fails an empty angle-bracket sha on a Checks line, with branch facts', () => {
  const ctx = setupTest();
  const body = ctx.buildBody('## Checks\n\n- [x] Deslop (<>)\n');

  expect(collectPrBodyErrors(body, ctx.buildFacts())).toStrictEqual([
    'Checks: the placeholder <> is still in the text; replace it with a real value or delete the line.',
  ]);
});

test('it fails a malformed bracketed sha on a Checks line', () => {
  const ctx = setupTest();
  const body = ctx.buildBody('## Checks\n\n- [x] Cold read (<abc def>)\n');

  expect(collectPrBodyErrors(body, ctx.buildFacts())).toStrictEqual([
    'Checks: Cold read (<abc def>) is not a commit hash; write the short hash of the commit you checked.',
  ]);
});

test('it fails a code block under Checks', () => {
  const ctx = setupTest();

  const body = ctx.buildBody(
    '## Checks\n\n```\n| step | result |\n| --- | --- |\n| typecheck | pass |\n```\n',
  );

  expect(collectPrBodyErrors(body)).toStrictEqual([
    'Checks: a code block sits under Checks; the section holds only the chex, Deslop and Cold read lines, so move the block to Verification or Description.',
  ]);
});

test('it fails a placeholder sha on a Checks line once', () => {
  const ctx = setupTest();
  const body = ctx.buildBody('## Checks\n\n- [x] Deslop (<sha>)\n');

  expect(collectPrBodyErrors(body)).toStrictEqual([
    'Checks: the placeholder <sha> is still in the text; replace it with a real value or delete the line.',
  ]);
});

test('it allows a placeholder inside a code block', () => {
  const ctx = setupTest();
  const body = ctx.buildBody('```sh\nchex pr-body --base <sha> --head <sha>\n```\n');

  expect(collectPrBodyErrors(body)).toStrictEqual([]);
});

test('it fails a 60-line code block', () => {
  const ctx = setupTest();
  const lines = Array.from({ length: 60 }, (_, index) => `const value${index} = ${index};`);
  const body = ctx.buildBody(`\`\`\`ts\n${lines.join('\n')}\n\`\`\`\n`);

  expect(collectPrBodyErrors(body)).toStrictEqual([
    'Description: a code block runs 60 lines; cut it to 50 or fewer, or link to the code.',
  ]);
});

test('it accepts a code block of exactly 50 lines and 100 characters', () => {
  const ctx = setupTest();
  const lines = Array.from({ length: 50 }, () => 'x'.repeat(100));
  const body = ctx.buildBody(`\`\`\`text\n${lines.join('\n')}\n\`\`\`\n`);

  expect(collectPrBodyErrors(body)).toStrictEqual([]);
});

test('it fails a code block with a 140-character line', () => {
  const ctx = setupTest();
  const body = ctx.buildBody(`\`\`\`sh\n${'x'.repeat(140)}\n\`\`\`\n`);

  expect(collectPrBodyErrors(body)).toStrictEqual([
    'Description: a code block has a line 140 characters wide; wrap it to 100 or fewer.',
  ]);
});

test('it fails a code block that is never closed', () => {
  const ctx = setupTest();

  expect(collectPrBodyErrors(ctx.buildBody('```ts\nconst a = 1;\n'))).toStrictEqual([
    'Description: a code block is never closed; add the closing fence.',
  ]);
});

test('it fails an unticked Deslop line and a hash that is not hex', () => {
  const ctx = setupTest();

  const body = ctx.buildBody(
    '## Checks\n\n- [ ] chex\n- [ ] Deslop (a1b2c3d)\n- [x] Cold read (latest)\n',
  );

  expect(collectPrBodyErrors(body)).toStrictEqual([
    'Checks: Deslop is not ticked; run it, then tick it with the commit you checked.',
    'Checks: Cold read (latest) is not a commit hash; write the short hash of the commit you checked.',
  ]);
});

test('it passes ticked checks whose commits are current', () => {
  const ctx = setupTest();

  const body = ctx.buildBody(
    '## Checks\n\n- [x] chex\n- [x] Deslop (a1b2c3d)\n- [x] Cold read (a1b2c3d)\n',
  );

  const facts = ctx.buildFacts({
    docFiles: ['skills/demo/SKILL.md'],
    newestDocChange: { commit: 'a1b2c3d4e5f6', files: ['skills/demo/SKILL.md'] },
    shaStates: { a1b2c3d: 'current' },
  });

  expect(collectPrBodyErrors(body, facts)).toStrictEqual([]);
});

test('it fails a Deslop sha older than a later skill edit and names the files', () => {
  const ctx = setupTest();

  const body = ctx.buildBody(
    '## Checks\n\n- [ ] chex\n- [x] Deslop (a1b2c3d)\n- [x] Cold read (f00dfee)\n',
  );

  const facts = ctx.buildFacts({
    docFiles: ['skills/demo/SKILL.md', 'skills/demo/references/rules.md'],
    newestDocChange: {
      commit: '9876543210ab',
      files: ['skills/demo/SKILL.md', 'skills/demo/references/rules.md'],
    },
    shaStates: { a1b2c3d: 'old', f00dfee: 'current' },
  });

  expect(collectPrBodyErrors(body, facts)).toStrictEqual([
    'Checks: Deslop (a1b2c3d) is older than commit 9876543, which changes skills/demo/SKILL.md, skills/demo/references/rules.md; re-run that check and update the sha.',
  ]);
});

test('it passes a Cold read sha older than a later skill edit', () => {
  const ctx = setupTest();

  const body = ctx.buildBody(
    '## Checks\n\n- [ ] chex\n- [x] Deslop (f00dfee)\n- [x] Cold read (a1b2c3d)\n',
  );

  const facts = ctx.buildFacts({
    docFiles: ['skills/demo/SKILL.md'],
    newestDocChange: { commit: 'f00dfee12345', files: ['skills/demo/SKILL.md'] },
    shaStates: { a1b2c3d: 'old', f00dfee: 'current' },
  });

  expect(collectPrBodyErrors(body, facts)).toStrictEqual([]);
});

test.each([
  [
    'unknown',
    'Checks: Deslop (a1b2c3d) is not a commit in this repo; write the short hash of the commit you checked.',
  ],
  [
    'outside',
    "Checks: Deslop (a1b2c3d) is not in this branch's history; re-run the check on the branch and update the sha.",
  ],
] as const)('it fails a Deslop sha that is %s', (state, message) => {
  const ctx = setupTest();
  const body = ctx.buildBody('## Checks\n\n- [x] Deslop (a1b2c3d)\n');

  expect(
    collectPrBodyErrors(body, ctx.buildFacts({ shaStates: { a1b2c3d: state } })),
  ).toStrictEqual([message]);
});

test('it does not probe shas without the branch facts', () => {
  const ctx = setupTest();
  const body = ctx.buildBody('## Checks\n\n- [x] Deslop (a1b2c3d)\n');

  expect(collectPrBodyErrors(body)).toStrictEqual([]);
});

test('it fails a PR that changes doc files and has no Checks section', () => {
  const ctx = setupTest();
  const facts = ctx.buildFacts({ docFiles: ['README.md', 'docs/guide.md'] });

  expect(collectPrBodyErrors(ctx.validBody, facts)).toStrictEqual([
    'Checks: the PR changes doc or skill files (README.md, docs/guide.md) but the body has no "## Checks" section; add one with the chex, Deslop and Cold read lines.',
  ]);
});

test('it accepts a body with no Checks section when no doc file changes', () => {
  const ctx = setupTest();

  expect(collectPrBodyErrors(ctx.validBody, ctx.buildFacts())).toStrictEqual([]);
});

test('it reads a body with Windows line endings', () => {
  const ctx = setupTest();

  expect(collectPrBodyErrors(ctx.validBody.replaceAll('\n', '\r\n'))).toStrictEqual([]);
});
