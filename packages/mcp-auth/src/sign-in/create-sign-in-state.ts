import { randomBytes } from 'node:crypto';
import { toTagged } from '@zgeoff/std';
import type { CorrelationID, OAuthClientID } from '../types.ts';

interface SignInRequest {
  // The signed authorization query the login page carries: one per request.
  readonly key: string;
  readonly clientID: OAuthClientID;
  readonly clientName: string;
  readonly redirectURI: string;
}

export interface PendingSignIn extends SignInRequest {
  // Random, minted with the signIn and never taken from the request, so
  // the security events of one authorization can be matched up.
  readonly correlationID: CorrelationID;
  failures: number;
  readonly expiresAt: number;

  // The one WebAuthn challenge this request's login page holds, if any.
  challenge: { readonly value: string; readonly expiresAt: number } | null;
}

export type TakenChallenge =
  | { readonly kind: 'taken'; readonly challenge: string }
  | { readonly kind: 'expired' }
  | { readonly kind: 'missing' };

// At most this many signIns wait at once across every client, and each
// client holds at most this many. Across every client, at most this many
// signIns start per minute.
const MAX_PENDING = 16;
const MAX_PENDING_PER_CLIENT = 3;
const MAX_STARTS_PER_MINUTE = 10;
const MAX_FAILURES = 5;
const MINUTE_MS = 60_000;

// How long a login page's challenge stays valid, unless its request
// expires sooner.
const CHALLENGE_MS = 5 * MINUTE_MS;

interface ApprovedSignIn {
  readonly binding: string;
  readonly correlationID: CorrelationID;
  readonly expiresAt: number;
}

export interface SignInState {
  // Returns null when the last minute already holds its share of starts.
  readonly createPending: (request: SignInRequest) => PendingSignIn | null;

  readonly findPending: (key: string) => PendingSignIn | null;

  // A fresh random challenge for the request's login page, replacing any
  // earlier one, or null when the request no longer waits.
  readonly mintChallenge: (key: string) => string | null;

  // Takes the request's challenge, so it verifies at most one assertion.
  readonly claimChallenge: (key: string) => TakenChallenge;

  // A failed sign-in counts against the request; the last allowed failure
  // drops it.
  readonly recordFailure: (key: string) => 'retry' | 'locked';

  readonly removePending: (key: string) => void;

  // Drops every sign-in a removed client started.
  readonly removeClient: (clientID: OAuthClientID) => void;

  readonly recordApproved: (sessionID: string, approved: Omit<ApprovedSignIn, 'expiresAt'>) => void;

  // What an owner session approved, or null once it expired or went.
  readonly findApproved: (sessionID: string) => ApprovedSignIn | null;

  readonly removeApproved: (sessionID: string) => void;
}

export function createSignInState(pendingMs: number, now: () => number): SignInState {
  const pending = new Map<string, PendingSignIn>();

  // Owner session id to the binding of the request its sign-in approved.
  const approved = new Map<string, ApprovedSignIn>();

  // Sign-in start times within the last minute, oldest first.
  let startedAt: readonly number[] = [];

  const dropExpired = (at: number): void => {
    for (const [key, signIn] of pending) {
      if (signIn.expiresAt <= at) {
        pending.delete(key);
      }
    }

    for (const [sessionID, request] of approved) {
      if (request.expiresAt <= at) {
        approved.delete(sessionID);
      }
    }
  };

  const findPending = (key: string): PendingSignIn | null => {
    dropExpired(now());

    return pending.get(key) ?? null;
  };

  return {
    createPending: (request) => {
      const current = now();

      dropExpired(current);

      startedAt = startedAt.filter((at) => current - at < MINUTE_MS);

      if (startedAt.length >= MAX_STARTS_PER_MINUTE) {
        return null;
      }

      const own = [...pending].filter(([, signIn]) => signIn.clientID === request.clientID);
      const [ownOldest] = own;

      // a new signIn drops the oldest rather than being refused, so no client can
      // hold the owner's signIns hostage.
      if (own.length >= MAX_PENDING_PER_CLIENT && ownOldest !== undefined) {
        pending.delete(ownOldest[0]);
      }

      const oldest = pending.keys().next();

      if (pending.size >= MAX_PENDING && oldest.done !== true) {
        pending.delete(oldest.value);
      }

      const signIn: PendingSignIn = {
        ...request,
        correlationID: toTagged<CorrelationID>(crypto.randomUUID()),
        failures: 0,
        expiresAt: current + pendingMs,
        challenge: null,
      };

      pending.set(signIn.key, signIn);

      startedAt = [...startedAt, current];

      return signIn;
    },

    findPending,

    mintChallenge: (key) => {
      const signIn = findPending(key);

      if (signIn === null) {
        return null;
      }

      const value = randomBytes(32).toString('base64url');

      signIn.challenge = {
        value,
        expiresAt: Math.min(now() + CHALLENGE_MS, signIn.expiresAt),
      };

      return value;
    },

    claimChallenge: (key) => {
      const signIn = findPending(key);
      const challenge = signIn?.challenge ?? null;

      if (signIn === null || challenge === null) {
        return { kind: 'missing' };
      }

      signIn.challenge = null;

      if (challenge.expiresAt <= now()) {
        return { kind: 'expired' };
      }

      return { kind: 'taken', challenge: challenge.value };
    },

    recordFailure: (key) => {
      const signIn = findPending(key);

      if (signIn === null) {
        return 'locked';
      }

      signIn.failures += 1;

      if (signIn.failures >= MAX_FAILURES) {
        pending.delete(key);

        return 'locked';
      }

      return 'retry';
    },

    removePending: (key) => {
      pending.delete(key);
    },

    removeClient: (clientID) => {
      for (const [key, signIn] of pending) {
        if (signIn.clientID === clientID) {
          pending.delete(key);
        }
      }
    },

    recordApproved: (sessionID, request) => {
      approved.set(sessionID, { ...request, expiresAt: now() + pendingMs });
    },

    findApproved: (sessionID) => {
      dropExpired(now());

      return approved.get(sessionID) ?? null;
    },

    removeApproved: (sessionID) => {
      approved.delete(sessionID);
    },
  };
}
