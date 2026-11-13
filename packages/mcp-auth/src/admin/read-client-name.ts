import { MCPAuthError } from '../mcp-auth-error.ts';
import { normalizeClientName } from '../utils/normalize-client-name.ts';

// A name the core stores or looks up: cleaned, and never empty.
export function readClientName(raw: string): string {
  const cleaned = normalizeClientName(raw, '');

  if (cleaned === '') {
    throw new MCPAuthError('invalid-client-name', 'the client name is empty after cleaning');
  }

  return cleaned;
}
