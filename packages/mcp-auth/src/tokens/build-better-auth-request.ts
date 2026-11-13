interface BetterAuthTarget {
  readonly path: string;
  readonly body: string | null;
}

// better-auth builds every URL it returns from its base URL, so a request that
// reached the app's own address goes in as if it came to the public origin.
// The DPoP header goes: without the proof better-auth issues a bearer token.
export function buildBetterAuthRequest(
  origin: string,
  request: Request,
  target: BetterAuthTarget,
): Request {
  const headers = new Headers(request.headers);

  headers.delete('dpop');

  return new Request(`${origin}${target.path}${new URL(request.url).search}`, {
    method: request.method,
    headers,
    ...(target.body === null ? {} : { body: target.body }),
  });
}
