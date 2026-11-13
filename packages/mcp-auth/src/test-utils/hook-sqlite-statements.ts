import type { Database } from 'bun:sqlite';

// Calls the hook with each statement the handle prepares, right before it
// runs. The Kysely driver prepares every statement through sqlite.query, so
// the hook is the exact point between two statements of the code under test.
export function hookSQLiteStatements(
  sqlite: Database,
  onStatement: (statement: string) => void,
): void {
  const original = sqlite.query.bind(sqlite);

  Reflect.set(sqlite, 'query', (statement: string) => {
    onStatement(statement);

    return original(statement);
  });
}
