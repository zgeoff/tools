const BEARER_PATTERN = /^Bearer (?<token>\S+)$/iu;

// Null when the header is missing or holds no bearer token.
export function findBearerToken(authorization: string | null): string | null {
  return BEARER_PATTERN.exec(authorization ?? '')?.groups?.['token'] ?? null;
}
