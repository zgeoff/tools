import { MCPAuthError } from '../mcp-auth-error.ts';
import { isAllowedRedirectURI } from '../utils/is-allowed-redirect-uri.ts';

export function checkRedirectURIs(redirectURIs: readonly string[]): void {
  if (redirectURIs.length === 0) {
    throw new MCPAuthError('invalid-redirect-uri', 'a client needs at least one redirect URI');
  }

  for (const uri of redirectURIs) {
    if (!isAllowedRedirectURI(uri)) {
      throw new MCPAuthError(
        'invalid-redirect-uri',
        'a redirect URI must use https, or http on a loopback host, with no fragment or user info',
      );
    }
  }
}
