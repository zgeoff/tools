// The scopes of the server that the grant holds, that the token names, and
// that the app's check allows when it narrows them.
interface HeldScopes {
  readonly grant: readonly string[];
  readonly token: readonly string[];
  readonly allowed: readonly string[] | null;
}

export function collectGrantedScopes<Scope extends string>(
  known: readonly Scope[],
  held: HeldScopes,
): Scope[] {
  return known.filter(
    (scope) =>
      held.grant.includes(scope) &&
      held.token.includes(scope) &&
      (held.allowed === null || held.allowed.includes(scope)),
  );
}
