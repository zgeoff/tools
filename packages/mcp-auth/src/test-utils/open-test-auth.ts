import type { Database } from 'bun:sqlite';
import type { Kysely } from 'kysely';
import { DEFAULT_PATHS } from '../default-paths.ts';
import { openMCPAuth } from '../open-mcp-auth.ts';
import type { GrantID, GrantLimits, MCPAuth, SecurityEvent, ServiceTokenFile } from '../types.ts';
import { buildStubClock } from './build-stub-clock.ts';
import { createTestDatabase } from './create-test-database.ts';

interface TestAuthInput<Limits> {
  readonly database?: Database;

  // The app's Kysely over the database, which the core then shares.
  // oxlint-disable-next-line typescript/no-explicit-any -- an app's Kysely is typed with its own tables
  readonly appKysely?: Kysely<any> | undefined;
  readonly grantLimits?: GrantLimits<Limits>;
  readonly serviceTokens?: {
    readonly prefix: string;
    readonly file: ServiceTokenFile<'read' | 'write'>;
  };
}

interface TestAuth<Limits> {
  readonly auth: MCPAuth<'read' | 'write', Limits>;
  readonly database: Database;
  readonly clock: ReturnType<typeof buildStubClock>;

  // Every security event the core recorded, and every grant it revoked.
  readonly events: SecurityEvent[];
  readonly revoked: GrantID[];

  // Closes the handle, then the database.
  readonly close: () => Promise<void>;
}

// A server for one test, at https://app.example with the read and write
// scopes, on a fresh in-memory database unless the test passes its own.
export async function openTestAuth<Limits = null>(
  input: TestAuthInput<Limits> = {},
): Promise<TestAuth<Limits>> {
  const database = input.database ?? createTestDatabase();
  const clock = buildStubClock();
  const events: SecurityEvent[] = [];
  const revoked: GrantID[] = [];

  const auth = await openMCPAuth({
    database: input.appKysely ?? database,
    origin: 'https://app.example',
    productName: 'app',
    scopes: ['read', 'write'],
    paths: DEFAULT_PATHS,
    tables: { passkey: 'app_passkey', enrollmentToken: 'app_enrollment_token' },
    clock,
    security: {
      record: (event) => {
        events.push(event);
      },
    },
    onGrantRevoked: (grantID) => {
      revoked.push(grantID);
    },
    ...(input.grantLimits === undefined ? {} : { grantLimits: input.grantLimits }),
    ...(input.serviceTokens === undefined ? {} : { serviceTokens: input.serviceTokens }),
  });

  return {
    auth,
    database,
    clock,
    events,
    revoked,
    close: async () => {
      await auth.close();

      database.close();
    },
  };
}
