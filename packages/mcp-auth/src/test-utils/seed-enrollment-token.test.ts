import { expect, onTestFinished, test } from 'bun:test';
import { openTestAuth } from './open-test-auth.ts';
import { seedEnrollmentToken } from './seed-enrollment-token.ts';

async function setupTest() {
  const server = await openTestAuth();

  onTestFinished(() => server.close());

  return server;
}

test('it makes an enrollment token the core has stored', async () => {
  const ctx = await setupTest();
  const token = await seedEnrollmentToken(ctx.auth);

  const stored = ctx.database.query('select token_hash from app_enrollment_token').all();

  expect(token).toStartWith('enroll-');
  expect(stored).toHaveLength(1);
});
