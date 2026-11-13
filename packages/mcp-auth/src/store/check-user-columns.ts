import type { Database } from 'bun:sqlite';
import { MCPAuthError } from '../mcp-auth-error.ts';
import { readTableColumns } from './read-table-columns.ts';

// A user table from before the grant columns cannot take them as new required
// columns, so the app's migration comes first.
export function checkUserColumns(sqlite: Database): void {
  const columns = readTableColumns(sqlite, 'user');

  if (columns.length === 0) {
    return;
  }

  for (const required of ['clientId', 'approvedBy']) {
    if (!columns.includes(required)) {
      throw new MCPAuthError(
        'invalid-setup',
        `the user table lacks the ${required} column; run the grant migration first`,
      );
    }
  }
}
