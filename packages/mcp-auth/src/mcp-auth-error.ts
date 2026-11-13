export type MCPAuthErrorCode =
  | 'conflict'
  | 'not-found'
  | 'invalid-client-name'
  | 'invalid-redirect-uri'
  | 'invalid-setup';

export class MCPAuthError extends Error {
  readonly code: MCPAuthErrorCode;

  constructor(code: MCPAuthErrorCode, message: string) {
    super(message);

    this.name = 'MCPAuthError';
    this.code = code;
  }
}
