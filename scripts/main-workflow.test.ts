// oxlint-disable zgeoff/test-beside-module -- a repo fact test of .github/workflows/main.yml, which bun test never reads in its hidden folder
import { expect, test } from 'bun:test';
import { z } from 'zod';

test('it runs every test script of the repo, but the related run, in the checks on main', async () => {
  const manifestJSON: unknown = await Bun.file(new URL('../package.json', import.meta.url)).json();

  const manifest = z.object({ scripts: z.record(z.string(), z.string()) }).parse(manifestJSON);

  const workflowText = await Bun.file(
    new URL('../.github/workflows/main.yml', import.meta.url),
  ).text();

  const workflow: unknown = Bun.YAML.parse(workflowText);

  const testScripts = Object.keys(manifest.scripts).filter(
    (name) => /^test(?::|$)/u.test(name) && name !== 'test:related',
  );

  expect(testScripts).toIncludeAllMembers(['test', 'test:browser', 'test:e2e', 'test:host']);

  expect(workflow).toMatchObject({
    jobs: {
      checks: {
        steps: expect.arrayContaining(testScripts.map((name) => ({ run: `bun run ${name}` }))),
      },
    },
  });
});

test('it sets up the Node on main that the pull request checks pass to bun-checks', async () => {
  const mainText = await Bun.file(new URL('../.github/workflows/main.yml', import.meta.url)).text();
  const prText = await Bun.file(new URL('../.github/workflows/pr.yml', import.meta.url)).text();

  const main: unknown = Bun.YAML.parse(mainText);
  const pr: unknown = Bun.YAML.parse(prText);

  expect(pr).toMatchObject({ jobs: { pr: { with: { 'node-version': 24 } } } });

  expect(main).toMatchObject({
    jobs: {
      checks: {
        steps: expect.arrayContaining([
          {
            uses: expect.stringMatching(/^actions\/setup-node@/u),
            with: { 'node-version': 24 },
          },
        ]),
      },
    },
  });
});
