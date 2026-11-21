import { isNativeFetchCall } from './is-native-fetch-call.ts';

interface RoutedFetchParts {
  readonly native: typeof fetch;
  readonly mocked: typeof fetch;
  readonly passthroughHosts: readonly string[];
}

// A fetch that sends each native call to Bun's fetch, and every other call to the fetch that msw
// patched.
export function makeRoutedFetch(parts: RoutedFetchParts): typeof fetch {
  const routed = (input: string | URL | Request, init?: BunFetchRequestInit) =>
    isNativeFetchCall(input, init, parts.passthroughHosts)
      ? parts.native(input, init)
      : parts.mocked(input, init);

  return Object.assign(routed, { preconnect: parts.native.preconnect });
}
