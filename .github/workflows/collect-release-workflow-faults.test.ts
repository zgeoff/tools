import { expect, test } from 'bun:test';
import { collectReleaseWorkflowFaults } from './collect-release-workflow-faults.ts';

test('it reports nothing for a release job in the expected order and shape', () => {
  const text = [
    'jobs:',
    '  release:',
    '    steps:',
    "      - name: Check untagged releases against main's head",
    '        run: bash check-release-head.sh',
    '      - name: Run release-please',
    '        uses: acme/release-action@abc123',
    '      - name: Auto-merge release PRs',
    "        if: steps.app-token.outputs.token != '' && inputs.merge == true",
    '        run: bash merge-release-prs.sh',
    "      - name: Check the merge against main's head",
    "        if: steps.merge.outputs.merged == 'true'",
    '        run: bash check-release-head.sh',
    '      - name: Tag the merged release',
    "        if: steps.merge.outputs.merged == 'true' && steps.release.outputs.releases_created != 'true'",
    '        uses: acme/release-action@abc123',
    '        with:',
    `          token: \${{ steps.app-token.outputs.token }}`,
    '          skip-github-pull-request: true',
    '      - name: Pick the release outputs',
    '        env:',
    `          RELEASE_OUTPUTS: \${{ steps.tag.outputs.releases_created == 'true' && toJSON(steps.tag.outputs) || toJSON(steps.release.outputs) }}`,
    '        run: echo picked',
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
    "      - name: Check untagged releases against main's head",
    '        run: bash check-release-head.sh',
    '      - name: Run release-please',
    '        uses: acme/release-action@abc123',
    '      - name: Auto-merge release PRs',
    "        if: steps.app-token.outputs.token != '' && inputs.merge == true",
    '        run: bash merge-release-prs.sh',
    "      - name: Check the merge against main's head",
    "        if: steps.merge.outputs.merged == 'true'",
    '        run: bash check-release-head.sh',
    '      - name: Tag the merged release',
    "        if: steps.merge.outputs.merged == 'true' && steps.release.outputs.releases_created != 'true'",
    '        uses: acme/release-action@def456',
    '        with:',
    `          token: \${{ github.token }}`,
    '      - name: Pick the release outputs',
    '        env:',
    `          RELEASE_OUTPUTS: \${{ steps.tag.outputs.releases_created == 'true' && toJSON(steps.tag.outputs) || toJSON(steps.release.outputs) }}`,
    '        run: echo picked',
    '',
  ].join('\n');

  const faults = collectReleaseWorkflowFaults(text);

  expect(faults).toStrictEqual([
    'Tag the merged release uses acme/release-action@def456, but Run release-please uses acme/release-action@abc123',
    'Tag the merged release must pass the App token as its token input',
    'Tag the merged release must set skip-github-pull-request: true',
  ]);
});

test('it reports a tag step that runs a script instead of release-please', () => {
  const text = [
    'jobs:',
    '  release:',
    '    steps:',
    "      - name: Check untagged releases against main's head",
    '        run: bash check-release-head.sh',
    '      - name: Run release-please',
    '        uses: acme/release-action@abc123',
    '      - name: Auto-merge release PRs',
    "        if: steps.app-token.outputs.token != '' && inputs.merge == true",
    '        run: bash merge-release-prs.sh',
    "      - name: Check the merge against main's head",
    "        if: steps.merge.outputs.merged == 'true'",
    '        run: bash check-release-head.sh',
    '      - name: Tag the merged release',
    "        if: steps.merge.outputs.merged == 'true' && steps.release.outputs.releases_created != 'true'",
    '        with:',
    `          token: \${{ steps.app-token.outputs.token }}`,
    '          skip-github-pull-request: true',
    '        run: git tag v1',
    '      - name: Pick the release outputs',
    '        env:',
    `          RELEASE_OUTPUTS: \${{ steps.tag.outputs.releases_created == 'true' && toJSON(steps.tag.outputs) || toJSON(steps.release.outputs) }}`,
    '        run: echo picked',
    '',
  ].join('\n');

  const faults = collectReleaseWorkflowFaults(text);

  expect(faults).toStrictEqual([
    'Tag the merged release uses no action, but Run release-please uses acme/release-action@abc123',
  ]);
});

test('it reports a pick step that reads only the first release-please outputs', () => {
  const text = [
    'jobs:',
    '  release:',
    '    steps:',
    "      - name: Check untagged releases against main's head",
    '        run: bash check-release-head.sh',
    '      - name: Run release-please',
    '        uses: acme/release-action@abc123',
    '      - name: Auto-merge release PRs',
    "        if: steps.app-token.outputs.token != '' && inputs.merge == true",
    '        run: bash merge-release-prs.sh',
    "      - name: Check the merge against main's head",
    "        if: steps.merge.outputs.merged == 'true'",
    '        run: bash check-release-head.sh',
    '      - name: Tag the merged release',
    "        if: steps.merge.outputs.merged == 'true' && steps.release.outputs.releases_created != 'true'",
    '        uses: acme/release-action@abc123',
    '        with:',
    `          token: \${{ steps.app-token.outputs.token }}`,
    '          skip-github-pull-request: true',
    '      - name: Pick the release outputs',
    '        env:',
    `          RELEASE_OUTPUTS: \${{ toJSON(steps.release.outputs) }}`,
    '        run: echo picked',
    '',
  ].join('\n');

  const faults = collectReleaseWorkflowFaults(text);

  expect(faults).toStrictEqual([
    'Pick the release outputs must read RELEASE_OUTPUTS from the tag step when it released, and from Run release-please otherwise',
  ]);
});

test('it reports head checks that run after the steps they guard', () => {
  const text = [
    'jobs:',
    '  release:',
    '    steps:',
    '      - name: Run release-please',
    '        uses: acme/release-action@abc123',
    "      - name: Check untagged releases against main's head",
    '        run: bash check-release-head.sh',
    '      - name: Auto-merge release PRs',
    "        if: steps.app-token.outputs.token != '' && inputs.merge == true",
    '        run: bash merge-release-prs.sh',
    '      - name: Tag the merged release',
    "        if: steps.merge.outputs.merged == 'true' && steps.release.outputs.releases_created != 'true'",
    '        uses: acme/release-action@abc123',
    '        with:',
    `          token: \${{ steps.app-token.outputs.token }}`,
    '          skip-github-pull-request: true',
    "      - name: Check the merge against main's head",
    "        if: steps.merge.outputs.merged == 'true'",
    '        run: bash check-release-head.sh',
    '      - name: Pick the release outputs',
    '        env:',
    `          RELEASE_OUTPUTS: \${{ steps.tag.outputs.releases_created == 'true' && toJSON(steps.tag.outputs) || toJSON(steps.release.outputs) }}`,
    '        run: echo picked',
    '',
  ].join('\n');

  const faults = collectReleaseWorkflowFaults(text);

  expect(faults).toStrictEqual([
    "Check untagged releases against main's head must run before Run release-please",
    "Check the merge against main's head must run after Auto-merge release PRs and before Tag the merged release",
  ]);
});

test('it reports each step the release job lacks', () => {
  const text = [
    'jobs:',
    '  release:',
    '    steps:',
    '      - name: Run release-please',
    '        uses: acme/release-action@abc123',
    '      - name: Auto-merge release PRs',
    "        if: steps.app-token.outputs.token != '' && inputs.merge == true",
    '        run: bash merge-release-prs.sh',
    '',
  ].join('\n');

  const faults = collectReleaseWorkflowFaults(text);

  expect(faults).toStrictEqual([
    "the release job has no step named Check untagged releases against main's head",
    "the release job has no step named Check the merge against main's head",
    'the release job has no step named Tag the merged release',
    'the release job has no step named Pick the release outputs',
  ]);
});
