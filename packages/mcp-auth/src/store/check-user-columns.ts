import type { QueryExecutorProvider } from 'kysely';
import { MCPAuthError } from '../mcp-auth-error.ts';
import { readTableColumns } from './read-table-columns.ts';

// A user table from before the grant columns cannot take them as new required
// columns, so the app's migration comes first.
export async function checkUserColumns(db: QueryExecutorProvider): Promise<void> {
  const columns = await readTableColumns(db, 'user');

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
