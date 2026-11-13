import type { MCPAuth } from '../types.ts';
import { buildFormRequest } from './build-form-request.ts';
import type { buildStubAuthenticator } from './build-stub-authenticator.ts';
import { buildTestRequester } from './build-test-requester.ts';
import { parsePasskeyPage } from './parse-passkey-page.ts';
import { seedEnrollmentToken } from './seed-enrollment-token.ts';

interface PasskeyInput {
  // The authenticator that holds the key of the passkey, so a test can sign in
  // with it.
  readonly authenticator: Pick<ReturnType<typeof buildStubAuthenticator>, 'create'>;
}

// Enrolls a passkey through the enrollment page, from a fresh enrollment token.
export async function seedPasskey(
  auth: Pick<MCPAuth<string, unknown>, 'issuer' | 'paths' | 'routes' | 'passkeys'>,
  input: PasskeyInput,
): Promise<void> {
  const token = await seedEnrollmentToken(auth);

  const url = `${auth.issuer}${auth.paths.browser.enroll}`;
  const headers = { origin: auth.issuer };
  const requester = buildTestRequester();

  const asked = await auth.routes.enroll(
    buildFormRequest(url, new URLSearchParams({ token }), headers),
    requester,
  );

  const askedHTML = await asked.text();

  const ceremony = parsePasskeyPage(askedHTML);

  if (ceremony.mode !== 'create') {
    throw new Error('the enrollment page asked for a sign-in');
  }

  const registration = await input.authenticator.create(ceremony.options, {
    origin: auth.issuer,
  });

  const credential = JSON.stringify(registration);

  const form = new URLSearchParams({ token, credential });

  const enrolled = await auth.routes.enroll(buildFormRequest(url, form, headers), requester);

  if (enrolled.status !== 200) {
    throw new Error(`the passkey did not enroll: ${enrolled.status}`);
  }
}
