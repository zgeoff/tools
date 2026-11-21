import { registerTestCleanup } from '../core/register-test-cleanup.ts';
import type { RecordedRequest, StartStubServerOptions, StubServer } from './types.ts';

// Starts an HTTP server on 127.0.0.1 and a free port. It records each request before it calls
// handle. After the test, the kit stops it, unless cleanup is 'manual'. Call it inside a test or a
// beforeEach.
export function startStubServer(
  handle: (request: Request) => Response | Promise<Response>,
  options: StartStubServerOptions = {},
): StubServer {
  const requests: RecordedRequest[] = [];

  const handleRequest = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    requests.push({
      method: request.method,
      path: `${url.pathname}${url.search}`,
      headers: Object.fromEntries(request.headers),
      body: await request.clone().text(),
    });

    return handle(request);
  };

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,

    // a stub that never answers must hold its connection open
    idleTimeout: 0,
    routes: { '/*': handleRequest },
  });

  const stopServer = async (): Promise<void> => {
    await server.stop(true);
  };

  return {
    url: `http://127.0.0.1:${server.port}`,
    requests,
    stop: options.cleanup === 'manual' ? stopServer : registerTestCleanup(stopServer),
  };
}
