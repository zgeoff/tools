import { afterAll, afterEach, beforeAll } from 'bun:test';
import { FetchInterceptor } from '@mswjs/interceptors/fetch/web';
import { HttpResponse, http } from 'msw';
import { InterceptorSource, defineNetwork } from 'msw/experimental';
import { makeRoutedFetch } from './make-routed-fetch.ts';
import type { TestNetwork, TestNetworkOptions } from './types.ts';

const defaultPassthroughHosts = ['127.0.0.1', '[::1]', 'localhost'];

// Two networks patch the same fetch, so the process keeps a marker that any copy of this module
// can see.
const networkMarker = Symbol.for('@zgeoff/testing/fetch.network');

// Sets up the one msw network of the test process, and registers the hooks that enable it, reset
// it after each test and disable it. Call it only from a module that the test preload lists: a call
// from a test file registers the hooks for that file only.
export function createTestNetwork(options: TestNetworkOptions): TestNetwork {
  if (Reflect.has(globalThis, networkMarker)) {
    throw new Error(
      'a test network already exists in this process; two networks patch the same fetch',
    );
  }

  Reflect.set(globalThis, networkMarker, true);

  const unmatched: string[] = [];

  // msw lets an unmatched request for a common asset, such as a .json or .ts file, through under
  // every onUnhandledFrame strategy that rejects. A last handler that matches everything fails
  // the request instead, so none reaches a real server.
  const recordUnmatched = http.all('*', (info) => {
    unmatched.push(`${info.request.method} ${info.request.url}`);

    return HttpResponse.error();
  });

  const network = defineNetwork({
    sources: [new InterceptorSource({ interceptors: [new FetchInterceptor()] })],
    handlers: [...options.handlers, recordUnmatched],
    context: { quiet: true },
    onUnhandledFrame: 'error',
  });

  let patchedFetch: typeof fetch | null = null;

  beforeAll(() => {
    const nativeFetch = globalThis.fetch;

    network.enable();

    patchedFetch = globalThis.fetch;

    globalThis.fetch = makeRoutedFetch({
      native: nativeFetch,
      mocked: patchedFetch,
      passthroughHosts: options.passthroughHosts ?? defaultPassthroughHosts,
    });
  });

  afterEach(() => {
    network.resetHandlers();

    if (unmatched.length === 0) {
      return;
    }

    const requests = unmatched.map((label) => `  ${label}`).join('\n');

    unmatched.length = 0;
    throw new Error(`the test sent requests that no handler matches:\n${requests}`);
  });

  afterAll(() => {
    if (patchedFetch !== null) {
      globalThis.fetch = patchedFetch;
    }

    network.disable();
  });

  return { use: network.use };
}
