import type { RequestHandler } from 'msw';

export interface TestNetworkOptions {
  // The defaults, kept after each test's reset.
  readonly handlers: readonly RequestHandler[];

  // Calls to these hosts go to Bun's own fetch, so code under test reaches a stub server. The
  // default is 127.0.0.1, [::1] and localhost.
  readonly passthroughHosts?: readonly string[];
}

export interface TestNetwork {
  // Adds handlers until the test ends.
  readonly use: (...handlers: readonly RequestHandler[]) => void;
}
