// The certificate code of simplewebauthn needs the polyfill loaded first, and a compiled binary does not load it.
// oxlint-disable-next-line import/no-unassigned-import -- the polyfill is a side effect
import './load-reflect-polyfill.ts';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';
import { toTagged } from '@zgeoff/std';
import { z } from 'zod';
import type { Store } from '../store/open-store.ts';
import type { PasskeyID } from '../types.ts';
import { parseJSONStrings } from '../utils/parse-json-strings.ts';
import { readPasskeyRows } from './read-passkey-rows.ts';
import { updatePasskeyUse } from './update-passkey-use.ts';

interface AssertionCheck {
  // The credential JSON the sign-in page posted.
  readonly credential: string;

  // The challenge the page was given, which the caller has already taken.
  readonly challenge: string;
  readonly origin: string;
  readonly rpID: string;
}

export async function verifyPasskeyAssertion(
  store: Store,
  check: AssertionCheck,
): Promise<PasskeyID | null> {
  const response = parseAssertion(check.credential);

  if (response === null) {
    return null;
  }

  const [passkey] = await readPasskeyRows(store.db, store.options.tables.passkey, response.id);

  if (passkey === undefined) {
    return null;
  }

  let verified: VerifiedAuthenticationResponse;

  try {
    verified = await verifyAuthenticationResponse({
      response,
      expectedChallenge: check.challenge,
      expectedOrigin: check.origin,
      expectedRPID: check.rpID,
      expectedType: 'webauthn.get',
      requireUserVerification: true,
      credential: {
        id: passkey.id,
        publicKey: new Uint8Array(Buffer.from(passkey.public_key, 'base64url')),
        counter: passkey.counter,
        transports: (parseJSONStrings(passkey.transports) ?? []).flatMap((transport) =>
          isTransport(transport) ? [transport] : [],
        ),
      },
    });
  } catch {
    return null;
  }

  if (!verified.verified || !verified.authenticationInfo.userVerified) {
    return null;
  }

  const stored = await updatePasskeyUse(store, {
    id: toTagged<PasskeyID>(passkey.id),
    counter: passkey.counter,
    newCounter: verified.authenticationInfo.newCounter,
  });

  return stored ? toTagged<PasskeyID>(passkey.id) : null;
}

const AssertionSchema = z.object({
  id: z.string().min(1),
  rawId: z.string().min(1),
  type: z.literal('public-key'),
  response: z.object({
    clientDataJSON: z.string(),
    authenticatorData: z.string(),
    signature: z.string(),
    userHandle: z.string().optional(),
  }),
});

// The posted JSON when it has the shape of an authentication response, else
// null; the verifier checks every value.
function parseAssertion(credential: string): AuthenticationResponseJSON | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(credential);
  } catch {
    return null;
  }

  const result = AssertionSchema.safeParse(parsed);

  if (!result.success) {
    return null;
  }

  const { userHandle, ...response } = result.data.response;

  return {
    id: result.data.id,
    rawId: result.data.rawId,
    type: result.data.type,
    response: userHandle === undefined ? response : { ...response, userHandle },
    clientExtensionResults: {},
  };
}

const TRANSPORTS = ['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'] as const;

function isTransport(value: string): value is (typeof TRANSPORTS)[number] {
  return TRANSPORTS.some((transport) => transport === value);
}
