import type { MCPAuth } from '../types.ts';
import { authorizeTestClient } from './authorize-test-client.ts';
import { seedClient } from './seed-client.ts';
import { seedEnrollmentToken } from './seed-enrollment-token.ts';
import { seedPasskey } from './seed-passkey.ts';

export interface TestDeps {
  readonly auth: MCPAuth<string, unknown>;
}

export function buildSeeder(deps: TestDeps) {
  return {
    client: (input?: Parameters<typeof seedClient>[1]) => seedClient(deps.auth, input),
    enrollmentToken: () => seedEnrollmentToken(deps.auth),
    passkey: (input: Parameters<typeof seedPasskey>[1]) => seedPasskey(deps.auth, input),
    grant: (input: Parameters<typeof authorizeTestClient>[1]) =>
      authorizeTestClient(deps.auth, input),
  };
}
