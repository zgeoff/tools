import { expect, test } from 'bun:test';
import { runNetworkFixture } from '../test-utils/run-network-fixture.ts';

function setupTest() {
  const serverSource = `
    export const hits: string[] = [];

    export const server = Bun.serve({
      port: 0,
      fetch: (request) => {
        hits.push(request.url);

        return new Response('real');
      },
    });
  `;

  return {
    runWithHandler: (handlerImport: string, handlerSource: string, outcomeSource: string) =>
      runNetworkFixture({
        'server.ts': serverSource,
        'network.ts': `
          import { http } from 'msw';
          import { ${handlerImport} } from 'msw';
          import { createTestNetwork } from './kit.ts';

          export const network = createTestNetwork({
            handlers: [${handlerSource}],
            passthroughHosts: [],
          });
        `,
        'kettle.test.ts': `
          import { afterAll, expect, test } from 'bun:test';
          import { hits, server } from './server.ts';

          afterAll(() => server.stop(true));

          test('the request fails and no server is hit', async () => {
            const outcome = await fetch(new URL('/data', server.url)).then(
              (response) => ${outcomeSource},
              () => 'rejected',
            );

            expect(outcome).toBe('rejected');
            expect(hits).toStrictEqual([]);
          });
        `,
      }),
  };
}

test('it rejects a request that a handler passes through', async () => {
  const ctx = setupTest();

  const result = await ctx.runWithHandler(
    'passthrough',
    `http.get('*/data', () => passthrough())`,
    `'answered'`,
  );

  expect(result.exitCode).toBe(0);
});

test('it rejects a request that a handler makes with bypass', async () => {
  const ctx = setupTest();

  const result = await ctx.runWithHandler(
    'bypass',
    `http.get('*/data', async ({ request }) => {
      const response = await fetch(bypass(new URL('/other', request.url)));

      return new Response(await response.text());
    })`,
    `response.status === 200 ? 'answered' : 'rejected'`,
  );

  expect(result.exitCode).toBe(0);
});
