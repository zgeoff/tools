// The scopes a token request gets: every scope of the client when the request
// names none, otherwise the requested ones, which the client must all hold.
export function pickClientCredentialsScopes(
  requested: string | null,
  clientScopes: readonly string[],
): readonly string[] | null {
  const names = [...new Set((requested ?? '').split(/\s+/u).filter((name) => name !== ''))];

  if (names.length === 0) {
    return clientScopes;
  }

  return names.every((name) => clientScopes.includes(name)) ? names : null;
}
