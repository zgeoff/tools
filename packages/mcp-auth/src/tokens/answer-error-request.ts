import type { RouteContext } from '../sign-in/route-context.ts';
import { buildPageResponse } from '../utils/build-page-response.ts';

// The error codes better-auth sends to the error page, each with the fixed
// sentence the page shows for it.
const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  invalid_client: 'the client is not one the owner added.',
  client_disabled: 'the client is disabled.',
  invalid_redirect: 'the redirect URI is not one the client was added with.',
  unauthorized_client: 'the client may not use the authorization code grant.',
  unsupported_response_type: 'only the authorization code response type is supported.',
  invalid_request: 'the request is malformed.',
};

// The page never shows text from the request, so a link to it cannot make the
// origin display words an attacker chose.
export function answerErrorRequest(ctx: RouteContext, request: Request): Response {
  const code = new URL(request.url).searchParams.get('error');

  const reason =
    code !== null && Object.hasOwn(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code] : undefined;

  return buildPageResponse(400, {
    message: `${ctx.productName} refused this authorization request: ${reason ?? 'the request is not valid.'}`,
  });
}
