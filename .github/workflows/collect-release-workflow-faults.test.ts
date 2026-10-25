import { expect, test } from 'bun:test';
import { collectReleaseWorkflowFaults } from './collect-release-workflow-faults.ts';

test('it reports nothing for a tag step on the same pin with the App token and no release PR', () => {
  const text = [
    'jobs:',
    '  release:',
    '    steps:',
    '      - name: Run release-please',
    '        uses: acme/release-action@abc123',
    '      - name: Tag the merged release',
    '        uses: acme/release-action@abc123',
    '        with:',
    `          token: \${{ steps.app-token.outputs.token }}`,
    '          skip-github-pull-request: true',
    '',
  ].join('\n');

  const faults = collectReleaseWorkflowFaults(text);

  expect(faults).toBeEmpty();
});

test('it reports a tag step on another pin, with another token, that opens release PRs', () => {
  const text = [
    'jobs:',
    '  release:',
    '    steps:',
    '      - name: Run release-please',
    '        uses: acme/release-action@abc123',
    '      - name: Tag the merged release',
    '        uses: acme/release-action@def456',
    '        with:',
    `          token: \${{ github.token }}`,
    '',
  ].join('\n');

  const faults = collectReleaseWorkflowFaults(text);

  expect(faults).toStrictEqual([
    'Tag the merged release uses acme/release-action@def456, but Run release-please uses acme/release-action@abc123',
    'Tag the merged release must pass the App token as its token input',
    'Tag the merged release must set skip-github-pull-request: true',
  ]);
});

test('it reports a release job with no tag step', () => {
  const text = [
    'jobs:',
    '  release:',
    '    steps:',
    '      - name: Run release-please',
    '        uses: acme/release-action@abc123',
    '',
  ].join('\n');

  const faults = collectReleaseWorkflowFaults(text);

  expect(faults).toStrictEqual([
    'the release job has no step named Tag the merged release that uses an action',
  ]);
});
