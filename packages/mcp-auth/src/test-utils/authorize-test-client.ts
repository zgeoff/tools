import type { GrantID, MCPAuth, OAuthClientID } from '../types.ts';
import { buildFormRequest } from './build-form-request.ts';
import { buildTestRequester } from './build-test-requester.ts';
import { readJSONRecord } from './read-json-record.ts';
import { TEST_REDIRECT_URI, runSignInToConsent } from './run-sign-in-to-consent.ts';

interface TestClientInput {
  readonly scopes: readonly string[];

  // The form fields that the app's grant limits read on the consent page.
  readonly consentFields?: URLSearchParams;
}

interface TestClientAuthorization {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly grantID: GrantID;
  readonly clientID: OAuthClientID;
}

// Drives auth.routes through a whole sign-in, with a stub WebAuthn
// authenticator in place of the owner's passkey: a new client, a new passkey,
// the authorize request, the passkey login, the consent, and the code exchange.
export async function authorizeTestClient(
  auth: MCPAuth<string, unknown>,
  input: TestClientInput,
): Promise<TestClientAuthorization> {
  const signedIn = await runSignInToConsent(auth, { scopes: input.scopes });

  const requester = buildTestRequester();
  const headers = { origin: auth.issuer };
  const consent = signedIn.consent;
  const cookie = signedIn.cookie;

  const form = new URLSearchParams(input.consentFields);

  form.set('oauth_query', consent.search.slice(1));
  form.set('decision', 'approve');

  for (const scope of input.scopes) {
    form.append('scope', scope);
  }

  const consented = await auth.routes.consent(
    buildFormRequest(`${auth.issuer}${auth.paths.browser.consent}`, form, { ...headers, cookie }),
    requester,
  );

  const callback = consented.headers.get('location');
  const code = callback === null ? null : new URL(callback).searchParams.get('code');

  if (code === null) {
    throw new Error(`the consent did not issue a code: ${consented.status}`);
  }

  const exchanged = await auth.routes.token(
    buildFormRequest(
      `${auth.issuer}${auth.paths.machine.token}`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: TEST_REDIRECT_URI,
        client_id: signedIn.clientID,
        code_verifier: signedIn.verifier,
      }),
    ),
    requester,
  );

  const tokens = await readJSONRecord(exchanged);

  const accessToken = tokens['access_token'];
  const refreshToken = tokens['refresh_token'];

  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    throw new TypeError(`the token endpoint answered ${exchanged.status} with no tokens`);
  }

  const grants = await auth.grants.list();

  const grant = grants.find((view) => view.clientID === signedIn.clientID);

  if (grant === undefined) {
    throw new Error('the sign-in left no grant');
  }

  return {
    accessToken,
    refreshToken,
    grantID: grant.grantID,
    clientID: signedIn.clientID,
  };
}
