import { expect, test } from 'bun:test';
import { runReleaseWorkflowCheck } from './run-release-workflow-check.ts';

test('it prints each fault of the shared release workflow and returns 1', async () => {
  const output: string[] = [];
  const errors: string[] = [];

  const text = [
    'jobs:',
    '  release:',
    '    steps:',
    '      - name: Run release-please',
    '        uses: acme/release-action@abc123',
    '      - name: Auto-merge release PRs',
    '        run: bash merge-release-prs.sh',
    '      - name: Tag the merged release',
    '        uses: acme/release-action@abc123',
    '',
  ].join('\n');

  const exitCode = await runReleaseWorkflowCheck({
    readWorkflow: () => Promise.resolve(text),
    writeOutput: (line) => output.push(line),
    writeError: (line) => errors.push(line),
  });

  expect({ exitCode, output, errors }).toStrictEqual({
    exitCode: 1,
    output: [
      ".github/workflows/release-please.yml: the release job has no step named Check untagged releases against main's head\n",
      ".github/workflows/release-please.yml: the release job has no step named Check the merge against main's head\n",
      '.github/workflows/release-please.yml: the release job has no step named Pick the release outputs\n',
    ],
    errors: [],
  });
});

test('it prints the read error and returns 2 when the workflow cannot be read', async () => {
  const output: string[] = [];
  const errors: string[] = [];

  const exitCode = await runReleaseWorkflowCheck({
    readWorkflow: () =>
      Promise.reject(new Error("ENOENT: no such file or directory, open 'release-please.yml'")),
    writeOutput: (line) => output.push(line),
    writeError: (line) => errors.push(line),
  });

  expect({ exitCode, output, errors }).toStrictEqual({
    exitCode: 2,
    output: [],
    errors: ["release-workflow: ENOENT: no such file or directory, open 'release-please.yml'\n"],
  });
});

test('it prints nothing and returns 0 for a workflow with no fault', async () => {
  const output: string[] = [];
  const errors: string[] = [];

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

  const exitCode = await runReleaseWorkflowCheck({
    readWorkflow: () => Promise.resolve(text),
    writeOutput: (line) => output.push(line),
    writeError: (line) => errors.push(line),
  });

  expect({ exitCode, output, errors }).toStrictEqual({ exitCode: 0, output: [], errors: [] });
});
