import type { Database } from 'bun:sqlite';
import { MCPAuthError } from '../mcp-auth-error.ts';
import type { MCPAuthTables } from '../types.ts';
import { readTableColumns } from './read-table-columns.ts';

const PASSKEY_COLUMNS = [
  'id',
  'public_key',
  'counter',
  'transports',
  'created_at',
  'last_used_at',
] as const;

const ENROLLMENT_COLUMNS = ['token_hash', 'created_at', 'expires_at'] as const;

// The core creates its own table and any column of it that is missing. It
// creates the app's passkey table when absent, and never adds a column to it.
export function createOwnedTables(sqlite: Database, tables: MCPAuthTables): void {
  sqlite.run(
    `create table if not exists "${tables.passkey}" (id text primary key not null, public_key text not null, counter integer not null, transports text not null, created_at text not null, last_used_at text)`,
  );

  const passkeyColumns = readTableColumns(sqlite, tables.passkey);
  const missing = PASSKEY_COLUMNS.filter((column) => !passkeyColumns.includes(column));

  if (missing.length > 0) {
    throw new MCPAuthError(
      'invalid-setup',
      `the passkey table ${tables.passkey} lacks the columns ${missing.join(', ')}`,
    );
  }

  sqlite.run(
    `create table if not exists "${tables.enrollmentToken}" (token_hash text primary key not null, created_at text not null, expires_at text not null)`,
  );

  const enrollmentColumns = readTableColumns(sqlite, tables.enrollmentToken);

  for (const column of ENROLLMENT_COLUMNS) {
    if (!enrollmentColumns.includes(column)) {
      sqlite.run(`alter table "${tables.enrollmentToken}" add column "${column}" text`);
    }
  }
}
