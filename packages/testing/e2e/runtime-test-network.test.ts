import { expect, test } from 'bun:test';
import { runNetworkFixture } from '../src/test-utils/run-network-fixture.ts';

test('it answers a request from the default handlers and from handlers a test adds', async () => {
  const result = await runNetworkFixture({
    'answers.test.ts': `
      import { expect, test } from 'bun:test';
      import { http, HttpResponse } from 'msw';
      import { network } from './network.ts';

      test('it answers', async () => {
        network.use(http.get('https://api.example/v1/invoices/7', () => HttpResponse.json({ id: 7 })));

        const added = await (await fetch('https://api.example/v1/invoices/7')).json();
        const initial = await (await fetch('https://default.example/status')).json();

        expect([added, initial]).toStrictEqual([{ id: 7 }, { up: true }]);
      });
    `,
  });

  expect(result.exitCode).toBe(0);
});

test('it fails a test whose code caught the rejection of an unmatched request', async () => {
  const result = await runNetworkFixture({
    'unmatched.test.ts': `
      import { expect, test } from 'bun:test';

      test('it catches the failed fetch', async () => {
        const outcome = await fetch('https://api.example/v1/invoices/9').catch(() => 'caught');

        expect(outcome).toBe('caught');
      });

      test('it sends nothing', () => {
        expect(1).toBe(1);
      });
    `,
  });

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('the test sent requests that no handler matches:');
  expect(result.stderr).toContain('GET https://api.example/v1/invoices/9');
  expect(result.stderr).toContain('(fail) it catches the failed fetch');
  expect(result.stderr).toContain(' 1 pass\n 1 fail');
});

test('it lists every unmatched request of the test with its method and URL', async () => {
  const result = await runNetworkFixture({
    'unmatched.test.ts': `
      import { test } from 'bun:test';

      test('it sends two', async () => {
        await fetch('https://api.example/a').catch(() => {});
        await fetch('https://api.example/b', { method: 'POST' }).catch(() => {});
      });
    `,
  });

  expect(result.stderr).toContain('  GET https://api.example/a\n  POST https://api.example/b');
});

test('it rejects the fetch call of an unmatched request', async () => {
  const result = await runNetworkFixture({
    'rejected.test.ts': `
      import { expect, test } from 'bun:test';

      test('it rejects', async () => {
        await expect(fetch('https://api.example/v1/invoices/9')).rejects.toThrow();
      });
    `,
  });

  expect(result.stderr).toContain('(fail) it rejects');
  expect(result.stderr).toContain('GET https://api.example/v1/invoices/9');
});

test('it removes a handler a test added, and keeps the defaults, after the test', async () => {
  const result = await runNetworkFixture({
    'reset.test.ts': `
      import { expect, test } from 'bun:test';
      import { http, HttpResponse } from 'msw';
      import { network } from './network.ts';

      test('it adds a handler', async () => {
        network.use(http.get('https://api.example/temporary', () => HttpResponse.text('here')));

        expect(await (await fetch('https://api.example/temporary')).text()).toBe('here');
      });

      test('it finds the default and not the added handler', async () => {
        const status = await (await fetch('https://default.example/status')).json();
        const gone = await fetch('https://api.example/temporary').then(() => 'answered', () => 'rejected');

        expect([status, gone]).toStrictEqual([{ up: true }, 'rejected']);
      });
    `,
  });

  expect(result.stderr).toContain(' 1 pass\n 1 fail');
  expect(result.stderr).toContain('(fail) it finds the default and not the added handler');
  expect(result.stderr).toContain('GET https://api.example/temporary');
});

test('it passes a network failure handler through as a rejection, with no unmatched request', async () => {
  const result = await runNetworkFixture({
    'failure.test.ts': `
      import { expect, test } from 'bun:test';
      import { http, HttpResponse } from 'msw';
      import { network } from './network.ts';

      test('it fails on purpose', async () => {
        network.use(http.get('https://api.example/v1/invoices/8', () => HttpResponse.error()));

        await expect(fetch('https://api.example/v1/invoices/8')).rejects.toThrow();
      });
    `,
  });

  expect(result.exitCode).toBe(0);
});

test('it lets a request reach a stub server on the loopback interface', async () => {
  const result = await runNetworkFixture({
    'loopback.test.ts': `
      import { expect, onTestFinished, test } from 'bun:test';

      test('it reaches the server', async () => {
        const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('served') });

        onTestFinished(() => server.stop(true));

        const response = await fetch(\`http://127.0.0.1:\${server.port}/\`);

        expect(await response.text()).toBe('served');
      });
    `,
  });

  expect(result.exitCode).toBe(0);
});

test('it sends a request to a host in passthroughHosts to the real network, and no other host', async () => {
  const result = await runNetworkFixture({
    'network.ts': `
      import { createTestNetwork } from './kit.ts';

      export const network = createTestNetwork({ handlers: [], passthroughHosts: ['stub.test'] });
    `,
    'named.test.ts': `
      import { expect, onTestFinished, test } from 'bun:test';

      test('it reaches the named host', async () => {
        const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('served') });

        onTestFinished(() => server.stop(true));

        const response = await fetch(\`http://stub.test:\${server.port}/\`, {
          proxy: \`http://127.0.0.1:\${server.port}\`,
        });

        expect(await response.text()).toBe('served');
      });
    `,
    'loopback.test.ts': `
      import { test } from 'bun:test';

      test('it no longer reaches loopback', async () => {
        await fetch('http://127.0.0.1:9/').catch(() => {});
      });
    `,
  });

  expect(result.stderr).toContain(' 1 pass\n 1 fail');
  expect(result.stderr).toContain('GET http://127.0.0.1:9/');
});

test('it sends a call with the unix option to the real server', async () => {
  const result = await runNetworkFixture({
    'unix.test.ts': `
      import { expect, onTestFinished, test } from 'bun:test';
      import { tmpdir } from 'node:os';
      import { join } from 'node:path';

      test('it reaches the socket', async () => {
        const unix = join(tmpdir(), \`network-fixture-\${process.pid}.sock\`);
        const server = Bun.serve({ unix, fetch: () => new Response('over the socket') });

        onTestFinished(() => server.stop(true));

        const response = await fetch('http://sock.example/', { unix });

        expect(await response.text()).toBe('over the socket');
      });
    `,
  });

  expect(result.exitCode).toBe(0);
});

test('it throws when a second network is created in the process', async () => {
  const result = await runNetworkFixture({
    'second.test.ts': `
      import { expect, test } from 'bun:test';
      import { createTestNetwork } from './kit.ts';

      test('it refuses a second network', () => {
        expect(() => createTestNetwork({ handlers: [] })).toThrow('a test network already exists');
      });
    `,
  });

  expect(result.exitCode).toBe(0);
});

test('it patches fetch only while the tests run, and never intercepts WebSocket', async () => {
  const result = await runNetworkFixture({
    'network.ts': `
      import { afterAll } from 'bun:test';
      import { createTestNetwork } from './kit.ts';

      const original = { fetch: globalThis.fetch, WebSocket: globalThis.WebSocket };

      export const network = createTestNetwork({ handlers: [] });
      export const isPatchedOnImport = globalThis.fetch !== original.fetch;
      export const isWebSocketKept = () => globalThis.WebSocket === original.WebSocket;
      export const isFetchOriginal = () => globalThis.fetch === original.fetch;

      afterAll(() => {
        console.log(\`fetch restored after all: \${isFetchOriginal()}\`);
      });
    `,
    'patch.test.ts': `
      import { expect, test } from 'bun:test';
      import { isFetchOriginal, isPatchedOnImport, isWebSocketKept } from './network.ts';

      test('it patches fetch only once the tests run', () => {
        expect([isPatchedOnImport, isFetchOriginal(), isWebSocketKept()]).toStrictEqual([false, false, true]);
      });
    `,
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout + result.stderr).toContain('fetch restored after all: true');
});

test('it fails an unmatched request for a common asset, and sends it to no host', async () => {
  const result = await runNetworkFixture({
    'asset.test.ts': `
      import { test } from 'bun:test';

      test('it asks for a json file', async () => {
        await fetch('https://api.example/data.json').catch(() => {});
        await fetch('https://api.example/main.ts').catch(() => {});
      });
    `,
  });

  expect(result.stderr).toContain('GET https://api.example/data.json');
  expect(result.stderr).toContain('GET https://api.example/main.ts');
  expect(result.stderr).toContain(' 0 pass\n 1 fail');
});

test.each([
  ['in parallel workers', ['--parallel=2']],
  ['in parallel workers without isolation', ['--parallel=2', '--no-isolate']],
  ['in one process without isolation', ['--no-isolate']],
])('it answers and checks every test file %s', async (_title, testArgs) => {
  const result = await runNetworkFixture(
    {
      'first.test.ts': `
        import { expect, test } from 'bun:test';

        test('first gets the default answer', async () => {
          const response = await fetch('https://default.example/status');

          expect(await response.json()).toStrictEqual({ up: true });
        });

        test('first fails on an unmatched request', async () => {
          await fetch('https://api.example/first').catch(() => {});
        });
      `,
      'second.test.ts': `
        import { expect, test } from 'bun:test';

        test('second gets the default answer', async () => {
          const response = await fetch('https://default.example/status');

          expect(await response.json()).toStrictEqual({ up: true });
        });

        test('second fails on an unmatched request', async () => {
          await fetch('https://api.example/second').catch(() => {});
        });
      `,
    },
    testArgs,
  );

  expect(result.stderr).toContain('GET https://api.example/first');
  expect(result.stderr).toContain('GET https://api.example/second');
  expect(result.stderr).toContain(' 2 pass\n 2 fail');
});
