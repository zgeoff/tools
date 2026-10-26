import { expect, test } from 'bun:test';
import { collectReleaseWorkflowFaults } from './collect-release-workflow-faults.ts';

function setupTest() {
  // A release job in the order and shape the check expects.
  const steps = {
    headCheck: [
      "      - name: Check untagged releases against main's head",
      '        run: bash check-release-head.sh',
    ],
    release: ['      - name: Run release-please', '        uses: acme/release-action@abc123'],
    merge: ['      - name: Auto-merge release PRs', '        run: bash merge-release-prs.sh'],
    mergeCheck: [
      "      - name: Check the merge against main's head",
      '        run: bash check-release-head.sh',
    ],
    tag: [
      '      - name: Tag the merged release',
      '        uses: acme/release-action@abc123',
      '        with:',
      `          token: \${{ steps.app-token.outputs.token }}`,
      '          skip-github-pull-request: true',
    ],
    pick: [
      '      - name: Pick the release outputs',
      '        env:',
      `          RELEASE_OUTPUTS: \${{ steps.tag.outputs.releases_created == 'true' && toJSON(steps.tag.outputs) || toJSON(steps.release.outputs) }}`,
      '        run: echo picked',
    ],
  };

  // Lists the steps in the given order; a replacement stands in for a step.
  const buildText = (
    order: readonly (keyof typeof steps)[],
    replacements: Partial<Record<keyof typeof steps, readonly string[]>> = {},
  ) =>
    [
      'jobs:',
      '  release:',
      '    steps:',
      ...order.flatMap((name) => replacements[name] ?? steps[name]),
      '',
    ].join('\n');

  return { buildText };
}

test('it reports nothing for a release job in the expected order and shape', () => {
  const ctx = setupTest();

  const faults = collectReleaseWorkflowFaults(
    ctx.buildText(['headCheck', 'release', 'merge', 'mergeCheck', 'tag', 'pick']),
  );

  expect(faults).toBeEmpty();
});

test('it reports a tag step on another pin, with another token, that opens release PRs', () => {
  const ctx = setupTest();

  const tag = [
    '      - name: Tag the merged release',
    '        uses: acme/release-action@def456',
    '        with:',
    `          token: \${{ github.token }}`,
  ];

  const faults = collectReleaseWorkflowFaults(
    ctx.buildText(['headCheck', 'release', 'merge', 'mergeCheck', 'tag', 'pick'], { tag }),
  );

  expect(faults).toStrictEqual([
    'Tag the merged release uses acme/release-action@def456, but Run release-please uses acme/release-action@abc123',
    'Tag the merged release must pass the App token as its token input',
    'Tag the merged release must set skip-github-pull-request: true',
  ]);
});

test('it reports a tag step that runs a script instead of release-please', () => {
  const ctx = setupTest();

  const tag = [
    '      - name: Tag the merged release',
    '        with:',
    `          token: \${{ steps.app-token.outputs.token }}`,
    '          skip-github-pull-request: true',
    '        run: git tag v1',
  ];

  const faults = collectReleaseWorkflowFaults(
    ctx.buildText(['headCheck', 'release', 'merge', 'mergeCheck', 'tag', 'pick'], { tag }),
  );

  expect(faults).toStrictEqual([
    'Tag the merged release uses no action, but Run release-please uses acme/release-action@abc123',
  ]);
});

test('it reports a pick step that reads only the first release-please outputs', () => {
  const ctx = setupTest();

  const pick = [
    '      - name: Pick the release outputs',
    '        env:',
    `          RELEASE_OUTPUTS: \${{ toJSON(steps.release.outputs) }}`,
    '        run: echo picked',
  ];

  const faults = collectReleaseWorkflowFaults(
    ctx.buildText(['headCheck', 'release', 'merge', 'mergeCheck', 'tag', 'pick'], { pick }),
  );

  expect(faults).toStrictEqual([
    'Pick the release outputs must read RELEASE_OUTPUTS from the tag step when it released, and from Run release-please otherwise',
  ]);
});

test('it reports head checks that run after the steps they guard', () => {
  const ctx = setupTest();

  const faults = collectReleaseWorkflowFaults(
    ctx.buildText(['release', 'headCheck', 'merge', 'tag', 'mergeCheck', 'pick']),
  );

  expect(faults).toStrictEqual([
    "Check untagged releases against main's head must run before Run release-please",
    "Check the merge against main's head must run after Auto-merge release PRs and before Tag the merged release",
  ]);
});

test('it reports each step the release job lacks', () => {
  const ctx = setupTest();
  const faults = collectReleaseWorkflowFaults(ctx.buildText(['release', 'merge']));

  expect(faults).toStrictEqual([
    "the release job has no step named Check untagged releases against main's head",
    "the release job has no step named Check the merge against main's head",
    'the release job has no step named Tag the merged release',
    'the release job has no step named Pick the release outputs',
  ]);
});
