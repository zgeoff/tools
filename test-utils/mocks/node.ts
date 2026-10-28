import { setupServer } from 'msw/node';

// The one MSW server of a test process. No remote service has default handlers yet, so a test adds
// a per-test handler for the answer it needs.
export const server = setupServer();
