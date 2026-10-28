import { expect, test } from 'bun:test';

test('it gives a caller that sets no time limit the reusable workflow default', async () => {
  const reusableText = await Bun.file(
    new URL('../../.github/workflows/bun-checks.yml', import.meta.url),
  ).text();

  const callerText = await Bun.file(new URL('pr.yml', import.meta.url)).text();

  const reusable: unknown = Bun.YAML.parse(reusableText);
  const caller: unknown = Bun.YAML.parse(callerText);

  expect(reusable).toMatchObject({
    on: { workflow_call: { inputs: { 'timeout-minutes': { default: 20 } } } },
  });

  expect(caller).toMatchObject({
    jobs: {
      pr: {
        with: { 'timeout-minutes': `\${{ fromJSON(vars.BUN_CHECK_TIMEOUT_MINUTES || '20') }}` },
      },
    },
  });
});
