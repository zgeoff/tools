import { Database } from 'bun:sqlite';

// A real SQLite engine in memory. A test that needs a second connection, such
// as one that revokes from another process, passes a file path instead.
export function createTestDatabase(path = ':memory:'): Database {
  return new Database(path, { create: true });
}
