import { randomBytes } from 'node:crypto';
import { sql } from 'kysely';
import type { Store } from '../store/open-store.ts';
import { deriveTokenHash } from '../utils/derive-token-hash.ts';

// How long an enrollment token stays usable after it is made.
const ENROLLMENT_TOKEN_MS = 15 * 60_000;

export async function createEnrollmentToken(store: Store): Promise<string> {
  const token = `enroll-${randomBytes(32).toString('base64url')}`;
  const now = store.options.clock.now();

  await sql`insert into ${sql.table(store.options.tables.enrollmentToken)} (token_hash, created_at, expires_at) values (${deriveTokenHash(token)}, ${new Date(now).toISOString()}, ${new Date(now + ENROLLMENT_TOKEN_MS).toISOString()})`.execute(
    store.db,
  );

  return token;
}
