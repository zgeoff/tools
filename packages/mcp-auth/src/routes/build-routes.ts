import { answerEnrollRequest } from '../passkeys/answer-enroll-request.ts';
import { answerAuthorizeRequest } from '../sign-in/answer-authorize-request.ts';
import { answerConsentRequest } from '../sign-in/answer-consent-request.ts';
import { answerLoginRequest } from '../sign-in/answer-login-request.ts';
import type { RouteContext } from '../sign-in/route-context.ts';
import { answerErrorRequest } from '../tokens/answer-error-request.ts';
import { answerMetadataRequest } from '../tokens/answer-metadata-request.ts';
import { answerRevokeRequest } from '../tokens/answer-revoke-request.ts';
import { answerTokenRequest } from '../tokens/answer-token-request.ts';
import type { MCPAuthRoutes } from '../types.ts';
import { withFormOrigin } from './with-form-origin.ts';

export function buildRoutes(ctx: RouteContext): MCPAuthRoutes {
  return {
    authorize: (request, requester) => answerAuthorizeRequest(ctx, request, requester),
    login: withFormOrigin(ctx.origin, (request, requester) =>
      answerLoginRequest(ctx, request, requester),
    ),
    enroll: withFormOrigin(ctx.origin, (request, requester) =>
      answerEnrollRequest(ctx, request, requester),
    ),
    consent: withFormOrigin(ctx.origin, (request, requester) =>
      answerConsentRequest(ctx, request, requester),
    ),
    error: (request) => Promise.resolve(answerErrorRequest(ctx, request)),
    token: (request, requester) => answerTokenRequest(ctx, request, requester),
    revoke: (request) => answerRevokeRequest(ctx, request),
    authorizationServerMetadata: () => answerMetadataRequest(ctx, 'authorization-server'),
    resourceMetadata: () => answerMetadataRequest(ctx, 'resource'),
  };
}
