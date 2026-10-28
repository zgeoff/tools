import { afterAll, afterEach, beforeAll } from 'bun:test';
import { server } from './node.ts';

const loopbackHosts: ReadonlySet<string> = new Set(['127.0.0.1', '[::1]', 'localhost']);

beforeAll(() => {
  server.listen({
    // the stub file server's tests call it on an ephemeral loopback port
    onUnhandledRequest: (request, print) => {
      if (!loopbackHosts.has(new URL(request.url).hostname)) {
        print.error();
      }
    },
  });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
