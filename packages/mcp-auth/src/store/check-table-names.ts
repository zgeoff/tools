import { MCPAuthError } from '../mcp-auth-error.ts';
import type { MCPAuthTables } from '../types.ts';

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/u;

// The names go into DDL statements, so each is a plain identifier.
export function checkTableNames(tables: MCPAuthTables): void {
  for (const name of [tables.passkey, tables.enrollmentToken]) {
    if (!IDENTIFIER.test(name)) {
      throw new MCPAuthError('invalid-setup', `${name} is not a plain table name`);
    }
  }
}
