// An OAuth error answer (RFC 6749 section 5.2).
export function buildOAuthError(status: number, error: string, description: string): Response {
  return Response.json(
    { error, error_description: description },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}
