import type { Database, SQLQueryBindings } from 'bun:sqlite';
import { CompiledQuery } from 'kysely';
import type { DatabaseConnection, Driver, QueryResult } from 'kysely';

// oxlint-disable zgeoff/function-verb -- Kysely's Driver interface fixes the method names

// Kysely's RuntimeDriver serializes the connection: SqliteAdapter reports no
// support for multiple connections, so RuntimeDriver holds a mutex from each
// acquire to its release.
export class BunSQLiteDriver implements Driver {
  private readonly connection: DatabaseConnection;

  // The driver's own turn chain exists only for the destroy() wait, because
  // Kysely calls destroy() outside RuntimeDriver's mutex.
  private turn: Promise<void> = Promise.resolve();

  private releaseTurn: () => void = () => {};

  constructor(sqlite: Database) {
    this.connection = buildConnection(sqlite);
  }

  init(): Promise<void> {
    return Promise.resolve();
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    const previous = this.turn;
    const next = Promise.withResolvers<void>();

    this.turn = next.promise;

    await previous;

    this.releaseTurn = next.resolve;

    return this.connection;
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('begin'));
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('commit'));
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('rollback'));
  }

  releaseConnection(): Promise<void> {
    this.releaseTurn();

    return Promise.resolve();
  }

  // The opener owns the handle and closes it, so destroy() leaves the handle
  // open and only waits for the caller that holds the connection.
  async destroy(): Promise<void> {
    await this.acquireConnection();
    await this.releaseConnection();
  }
}

function buildConnection(sqlite: Database): DatabaseConnection {
  return {
    executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
      const stmt = sqlite.query<R, SQLQueryBindings[]>(compiledQuery.sql);

      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Kysely's SQLite compiler binds only values that bun:sqlite accepts
      const bindings = compiledQuery.parameters as SQLQueryBindings[];

      if (stmt.columnNames.length > 0) {
        return Promise.resolve({ rows: stmt.all(...bindings) });
      }

      const result = stmt.run(...bindings);

      return Promise.resolve({
        rows: [],
        numAffectedRows: BigInt(result.changes),
        insertId: BigInt(result.lastInsertRowid),
      });
    },

    streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
      throw new Error('BunSQLiteDriver does not support streaming queries');
    },
  };
}
