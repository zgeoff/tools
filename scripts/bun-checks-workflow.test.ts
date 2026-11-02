// oxlint-disable zgeoff/test-beside-module -- a repo fact test of .github/workflows/bun-checks.yml, which bun test never reads in its hidden folder
import { expect, test } from 'bun:test';
import { z } from 'zod';

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
