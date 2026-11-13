import type { EnrollmentState } from '../passkeys/create-enrollment-state.ts';
import type { Store } from '../store/open-store.ts';
import type { Clock, GrantLimits, MCPAuthPaths, SecuritySink } from '../types.ts';
import type { SignInState } from './create-sign-in-state.ts';

// What every route reads: the server's identity, the sign-ins waiting for the
// owner, and the passkey enrollments in progress.
export interface RouteContext {
  readonly store: Store;
  readonly origin: string;

  // The one resource every token is bound to.
  readonly resource: string;
  readonly paths: MCPAuthPaths;
  readonly productName: string;
  readonly scopes: readonly string[];
  readonly clock: Clock;
  readonly security: SecuritySink;
  readonly signIns: SignInState;
  readonly enrollments: EnrollmentState;
  readonly consentFields: Pick<
    GrantLimits<unknown>,
    'renderConsentFields' | 'parseConsentFields'
  > | null;
}
