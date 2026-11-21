import { createTestNetwork } from '@zgeoff/testing/fetch';

// The one msw network of a test process, which the root bunfig.toml lists as a preload. No remote
// service has default handlers yet, so a test adds a per-test handler for the answer it needs.
export const network = createTestNetwork({ handlers: [] });
