import { createHash } from 'node:crypto';
import type { MCPAuth, OAuthClientID } from '../types.ts';
import { buildFormRequest } from './build-form-request.ts';
import { buildStubAuthenticator } from './build-stub-authenticator.ts';
import { buildTestRequester } from './build-test-requester.ts';
import { parsePasskeyPage } from './parse-passkey-page.ts';
import { seedClient } from './seed-client.ts';
import { seedPasskey } from './seed-passkey.ts';

export const TEST_REDIRECT_URI = 'https://client.example/callback';

interface SignInInput {
  readonly scopes: readonly string[];
}

export interface SignInAtConsent {
  readonly clientID: OAuthClientID;

  // The PKCE verifier whose challenge the authorize request carried.
  readonly verifier: string;

  // The consent page the passkey login sent the browser to, and the session
  // cookie that login set.
  readonly consent: URL;
  readonly cookie: string;
}

// A new client and passkey, the authorize request, and the passkey login, up
// to the consent page.
export async function runSignInToConsent(
  auth: MCPAuth<string, unknown>,
  input: SignInInput,
): Promise<SignInAtConsent> {
  const client = await seedClient(auth, { redirectURIs: [TEST_REDIRECT_URI] });

  const authenticator = buildStubAuthenticator();

  await seedPasskey(auth, { authenticator });

  const requester = buildTestRequester();
  const verifier = `test-verifier-${crypto.randomUUID()}`;

  const authorize = new URL(`${auth.issuer}${auth.paths.browser.authorize}`);

  authorize.search = new URLSearchParams({
    response_type: 'code',
    client_id: client.clientID,
    redirect_uri: TEST_REDIRECT_URI,
    scope: input.scopes.join(' '),
    state: 'state-1',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    resource: auth.resource,
  }).toString();

  const authorized = await auth.routes.authorize(new Request(authorize.href), requester);

  const login = new URL(authorized.headers.get('location') ?? '/', auth.issuer);

  if (login.pathname !== auth.paths.browser.login) {
    throw new Error(`authorization did not reach the login page: ${login.href}`);
  }

  const page = await auth.routes.login(new Request(login.href), requester);
  const pageHTML = await page.text();

  const ceremony = parsePasskeyPage(pageHTML);

  if (ceremony.mode !== 'get') {
    throw new Error('the login page asked to enroll a passkey');
  }

  const assertion = await authenticator.signAssertion(ceremony.options, { origin: auth.issuer });

  const loginForm = new URLSearchParams({
    oauth_query: login.search.slice(1),
    credential: JSON.stringify(assertion),
  });

  const loginURL = `${auth.issuer}${auth.paths.browser.login}`;
  const headers = { origin: auth.issuer };

  const signedIn = await auth.routes.login(
    buildFormRequest(loginURL, loginForm, headers),
    requester,
  );

  const consent = new URL(signedIn.headers.get('location') ?? '/', auth.issuer);

  if (consent.pathname !== auth.paths.browser.consent) {
    throw new Error(`the passkey login did not reach the consent page: ${consent.href}`);
  }

  const cookie = signedIn.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .join('; ');

  return { clientID: client.clientID, verifier, consent, cookie };
}
