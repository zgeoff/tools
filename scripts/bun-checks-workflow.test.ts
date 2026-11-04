// oxlint-disable zgeoff/test-beside-module -- a repo fact test of .github/workflows/bun-checks.yml, which bun test never reads in its hidden folder
import { expect, test } from 'bun:test';
import { z } from 'zod';
import { laneNames } from '../packages/chex/src/ci-plan/plan-check-scripts.ts';

test('it asks for no permission beyond contents read, so a read-only caller can run it', async () => {
  const workflowText = await Bun.file(
    new URL('../.github/workflows/bun-checks.yml', import.meta.url),
  ).text();

  const jobSchema = z.object({ permissions: z.record(z.string(), z.string()).optional() });

  const workflow = z
    .object({
      permissions: z.record(z.string(), z.string()).optional(),
      jobs: z.record(z.string(), jobSchema),
    })
    .parse(Bun.YAML.parse(workflowText));

  const grants = [
    workflow.permissions,
    ...Object.values(workflow.jobs).map((job) => job.permissions),
  ];

  expect(grants.filter((grant) => grant !== undefined)).toSatisfyAll(
    (grant: Readonly<Record<string, string>>) =>
      Object.entries(grant).every(([scope, level]) => scope === 'contents' && level === 'read'),
  );
});

test.each(['static', 'checks'])(
  'it runs each chex check of the %s job from the npm release that CHEX pins',
  async (jobName) => {
    const workflowText = await Bun.file(
      new URL('../.github/workflows/bun-checks.yml', import.meta.url),
    ).text();

    const stepSchema = z.object({ name: z.string().optional(), run: z.string().optional() });
    const jobSchema = z.object({ steps: z.array(stepSchema) });

    const workflow = z
      .object({
        env: z.object({ CHEX: z.string() }),
        jobs: z.record(z.string(), jobSchema),
      })
      .parse(Bun.YAML.parse(workflowText));

    const steps = workflow.jobs[jobName]?.steps ?? [];

    const isChexStep = (step: z.infer<typeof stepSchema>) =>
      step.run?.includes('$CHEX') === true || step.run?.includes('chex/src/cli') === true;

    const chexSteps = Object.fromEntries(
      steps
        .filter((step) => isChexStep(step))
        .map((step): [string, string] => [step.name ?? '', step.run ?? '']),
    );

    expect(workflow.env.CHEX).toMatch(/^@zgeoff\/chex@\d+\.\d+\.\d+$/u);

    expect(chexSteps).toStrictEqual({
      'Plan the check scripts': 'bun x "$CHEX" ci-plan',
      'Check prose': 'bun x "$CHEX" prose',
      'Check length': 'bun x "$CHEX" length',
      'Check links': 'bun x "$CHEX" links',
      'Check readmes': 'bun x "$CHEX" readmes',
      'Check vision': 'bun x "$CHEX" vision',
      'Check skill': 'bun x "$CHEX" skill',
      'Lint workflows': 'bun x "$CHEX" workflows',
      'Check commits': 'bun x "$CHEX" commits',
      'Check local paths': 'bun x "$CHEX" local-paths',
      'Check test timeouts': 'bun x "$CHEX" test-timeouts',
      'Check dependency gates': 'bun x "$CHEX" dependency-gates',
    });
  },
);

test('it gives the private checks job one Lane step for each lane that chex ci-plan plans', async () => {
  const workflowText = await Bun.file(
    new URL('../.github/workflows/bun-checks.yml', import.meta.url),
  ).text();

  const stepSchema = z.object({ name: z.string().optional() });
  const checksSchema = z.object({ steps: z.array(stepSchema) });

  const workflow = z
    .object({ jobs: z.object({ checks: checksSchema }) })
    .parse(Bun.YAML.parse(workflowText));

  const laneSteps = workflow.jobs.checks.steps
    .map((step) => step.name ?? '')
    .filter((name) => name.startsWith('Lane '));

  expect(laneSteps).toStrictEqual(laneNames.map((lane) => `Lane ${lane}`));
});
