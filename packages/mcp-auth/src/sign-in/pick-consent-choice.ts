// `scope` is what better-auth is asked to grant, null when the choice denies.
// `noneTicked` is an allow sent with no scope ticked, which denies.
interface ConsentChoice {
  readonly accept: boolean;
  readonly scopes: readonly string[];
  readonly scope: string | null;
  readonly noneTicked: boolean;
}

// The owner's answer on the consent form, from the scopes it ticked and its
// decision. A ticked value that is no scope of the server counts for nothing.
export function pickConsentChoice(
  known: readonly string[],
  ticked: readonly string[],
  decision: string | null,
): ConsentChoice {
  const scopes = known.filter((scope) => ticked.includes(scope));
  const allow = decision === 'approve';
  const accept = allow && scopes.length > 0;

  return {
    accept,
    scopes: accept ? scopes : [],
    scope: accept ? [...scopes, 'offline_access'].join(' ') : null,
    noneTicked: allow && !accept,
  };
}
