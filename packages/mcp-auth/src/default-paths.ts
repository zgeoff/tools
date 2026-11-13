import type { MCPAuthPaths } from './types.ts';

// An app that serves other paths passes its own object of this shape.
export const DEFAULT_PATHS = {
  browser: {
    authorize: '/oauth2/authorize',
    login: '/login',
    enroll: '/enroll',
    consent: '/consent',
    error: '/error',
  },
  machine: {
    mcp: '/mcp',
    root: '/',
    token: '/oauth2/token',
    revoke: '/oauth2/revoke',
    authorizationServerMetadata: '/.well-known/oauth-authorization-server',
    resourceMetadata: '/.well-known/oauth-protected-resource',
    mcpResourceMetadata: '/.well-known/oauth-protected-resource/mcp',
  },
} as const satisfies MCPAuthPaths;
