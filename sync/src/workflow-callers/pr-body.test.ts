import { expect, test } from 'bun:test';
import { isRecord } from '../../../packages/std/src/guards/is-record.ts';

function setupTest() {
  const reusablePath = '../../../.github/workflows/pr-body-check.yml';

  const files = {
    readYaml: async (path: string): Promise<Record<string, unknown>> => {
      const text = await Bun.file(new URL(path, import.meta.url)).text();

      const parsed: unknown = Bun.YAML.parse(text);

      if (!isRecord(parsed)) {
        throw new Error(`${path} is not a mapping`);
      }

      return parsed;
    },
  };

  const readJob = async (name: string): Promise<Record<string, unknown>> => {
    const reusable = await files.readYaml(reusablePath);

    const job = isRecord(reusable['jobs']) ? reusable['jobs'][name] : undefined;

    if (!isRecord(job)) {
      throw new Error(`no job ${name}`);
    }

    return job;
  };

  const readRuns = async (name: string): Promise<string[]> => {
    const job = await readJob(name);

    return Array.isArray(job['steps'])
      ? job['steps'].flatMap((step) =>
          isRecord(step) && typeof step['run'] === 'string' ? [step['run']] : [],
        )
      : [];
  };

  return {
    reusablePath,
    readYaml: files.readYaml,
    readJob,
    readRuns,
    readText: (path: string) => Bun.file(new URL(path, import.meta.url)).text(),
  };
}

test('it calls the reusable PR-body workflow at main with the permissions its jobs need', async () => {
  const ctx = setupTest();

  const caller = await ctx.readYaml('pr-body.yml');

  expect(caller).toMatchObject({
    on: {
      pull_request: { types: ['opened', 'edited', 'reopened', 'synchronize'] },
    },
    concurrency: {
      group: `pr-body-\${{ github.event.pull_request.number }}`,
      'cancel-in-progress': true,
    },
    jobs: {
      'pr-body': {
        permissions: { contents: 'read', 'pull-requests': 'write' },
        uses: 'zgeoff/tools/.github/workflows/pr-body-check.yml@main',
      },
    },
  });
});

test('it asks for the permissions the caller grants and no more', async () => {
  const ctx = setupTest();

  const reusable = await ctx.readYaml(ctx.reusablePath);

  expect(reusable).toMatchObject({
    on: { workflow_call: null },
    jobs: {
      'pr-body': { permissions: { contents: 'read', 'pull-requests': 'read' } },
      'tick-chex': {
        permissions: { contents: 'read', 'pull-requests': 'write' },
      },
    },
  });
});

test('it skips a bot in both jobs', async () => {
  const ctx = setupTest();

  const body = await ctx.readJob('pr-body');
  const tick = await ctx.readJob('tick-chex');

  expect(body['if']).toBe(`github.event.pull_request.user.type != 'Bot'`);
  expect(tick['if']).toContain(`github.event.pull_request.user.type != 'Bot'`);
});

test('it ticks the box only on a new pull request, a reopen and a push, and never on a fork', async () => {
  const ctx = setupTest();

  const tick = await ctx.readJob('tick-chex');

  expect(tick['if']).toContain(
    `contains(fromJSON('["opened", "reopened", "synchronize"]'), github.event.action)`,
  );

  expect(tick['if']).not.toContain('edited');

  expect(tick['if']).toContain(
    'github.event.pull_request.head.repo.full_name == github.repository',
  );
});

test('it reaches a command only through env, never through an expression in run', async () => {
  const ctx = setupTest();

  const bodyRuns = await ctx.readRuns('pr-body');
  const tickRuns = await ctx.readRuns('tick-chex');

  const runs = [...bodyRuns, ...tickRuns];

  expect(runs.length).toBeGreaterThan(0);
  expect(runs.filter((run) => run.includes('${{'))).toStrictEqual([]);
});

test('it holds one chex pin that every chex command reads, and the pin check covers the file', async () => {
  const ctx = setupTest();

  const reusable = await ctx.readText(ctx.reusablePath);
  const checkScript = await ctx.readText('../../../scripts/src/pr-checks/check-pr-body.sh');
  const tickScript = await ctx.readText('../../../scripts/src/pr-checks/tick-chex-box.sh');
  const pinCheck = await ctx.readText('../../../scripts/src/renovate/find-unmanaged-chex-pin.ts');
  const renovate = await ctx.readText('../../../renovate.json');

  expect({
    pins: reusable.match(/@zgeoff\/chex@/gu)?.length,
    unpinned: [reusable, checkScript, tickScript].flatMap(
      (text) => text.match(/bun x (?!"\$CHEX")/gu) ?? [],
    ),
  }).toStrictEqual({ pins: 1, unpinned: [] });

  expect(pinCheck).toContain('.github/workflows/pr-body-check.yml');
  expect(renovate).toContain('pr-body-check');
});

test('it checks out the full history in both jobs, so the docs check finds a merge base', async () => {
  const ctx = setupTest();

  const checkouts = await Promise.all(
    ['pr-body', 'tick-chex'].map(async (name) => {
      const job = await ctx.readJob(name);

      const steps: unknown[] = Array.isArray(job['steps']) ? job['steps'] : [];

      const checkout = steps.find(
        (step) =>
          isRecord(step) &&
          typeof step['uses'] === 'string' &&
          step['uses'].startsWith('actions/checkout@'),
      );

      return isRecord(checkout) ? checkout['with'] : undefined;
    }),
  );

  expect(checkouts).toMatchObject([
    { 'fetch-depth': 0, filter: 'blob:none' },
    { 'fetch-depth': 0, filter: 'blob:none' },
  ]);
});

test('it downloads the step scripts that its steps run', async () => {
  const ctx = setupTest();

  const reusable = await ctx.readText(ctx.reusablePath);
  const downloader = await ctx.readText('../../../scripts/src/ci/download-step-scripts.ts');

  expect(reusable).toContain('download-step-scripts.ts" pr-body-check');
  expect(downloader).toContain('scripts/src/pr-checks/check-pr-body.sh');
  expect(downloader).toContain('scripts/src/pr-checks/tick-chex-box.sh');
});
