import { expect, test } from 'bun:test';
import { runNetworkFixture } from './run-network-fixture.ts';

test('it runs the fixture test files with the fixture network as the preload', async () => {
  const result = await runNetworkFixture({
    'network.ts': `
      import { createTestNetwork } from './kit.ts';

      export const network = createTestNetwork({ handlers: [] });
    `,
    'kettle.test.ts': `
      import { expect, test } from 'bun:test';
      import { network } from './network.ts';

      test('the preload made the network', () => {
        expect(typeof network.use).toBe('function');
      });
    `,
  });

  expect(result.exitCode).toBe(0);
  expect(result.stderr).toContain('1 pass');
});

test('it gives a fixture with no network.ts a network with one default handler', async () => {
  const result = await runNetworkFixture({
    'kettle.test.ts': `
      import { expect, test } from 'bun:test';

      test('the default handler answers', async () => {
        const response = await fetch('https://default.example/status');

        expect(await response.json()).toStrictEqual({ up: true });
      });
    `,
  });

  expect(result.exitCode).toBe(0);
});
