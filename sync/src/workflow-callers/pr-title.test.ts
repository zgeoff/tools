import { expect, test } from 'bun:test';
import { isRecord } from '../../../packages/std/src/guards/is-record.ts';

function setupTest() {
  return {
    readYaml: async (path: string): Promise<Record<string, unknown>> => {
      const text = await Bun.file(new URL(path, import.meta.url)).text();

      const parsed: unknown = Bun.YAML.parse(text);

      if (!isRecord(parsed)) {
        throw new Error(`${path} is not a mapping`);
      }

      return parsed;
    },
  };
}

test('it calls the reusable PR-title workflow at main with the permissions its job needs', async () => {
  const ctx = setupTest();

  const caller = await ctx.readYaml('pr-title.yml');

  expect(caller).toMatchObject({
    on: { pull_request: { types: ['opened', 'edited', 'reopened', 'synchronize'] } },
    concurrency: {
      group: `pr-title-\${{ github.event.pull_request.number }}`,
      'cancel-in-progress': true,
    },
    jobs: {
      'pr-title': {
        permissions: { contents: 'read' },
        uses: 'zgeoff/tools/.github/workflows/pr-title-check.yml@main',
      },
    },
  });
});

test('it skips a bot and reads only the contents', async () => {
  const ctx = setupTest();

  const reusable = await ctx.readYaml('../../../.github/workflows/pr-title-check.yml');

  expect(reusable).toMatchObject({
    on: { workflow_call: null },
    jobs: {
      'pr-title': {
        if: `github.event.pull_request.user.type != 'Bot'`,
        permissions: { contents: 'read' },
      },
    },
  });
});

test('it reaches the title through env alone and names the fix on a failure', async () => {
  const ctx = setupTest();

  const reusable = await ctx.readYaml('../../../.github/workflows/pr-title-check.yml');

  const jobs = reusable['jobs'];
  const job = isRecord(jobs) ? jobs['pr-title'] : undefined;
  const steps = isRecord(job) && Array.isArray(job['steps']) ? job['steps'] : [];

  const runs = steps.flatMap((step: unknown) =>
    isRecord(step) && typeof step['run'] === 'string' ? [step['run']] : [],
  );

  expect(runs.filter((run) => run.includes('${{'))).toStrictEqual([]);

  expect(steps).toContainEqual(
    expect.objectContaining({ env: { PR_TITLE: `\${{ github.event.pull_request.title }}` } }),
  );

  expect(runs.join('\n')).toContain('Rename the PR title to a Conventional Commit');
});

test('it installs the shared rules from npm at pinned versions', async () => {
  const ctx = setupTest();

  const reusable = await ctx.readYaml('../../../.github/workflows/pr-title-check.yml');

  expect(reusable).toMatchObject({
    env: {
      COMMITLINT_CLI: expect.stringMatching(/^@commitlint\/cli@\d+\.\d+\.\d+$/u),
      COMMITLINT_CONFIG: expect.stringMatching(/^@zgeoff\/commitlint-config@\d+\.\d+\.\d+$/u),
    },
  });
});
