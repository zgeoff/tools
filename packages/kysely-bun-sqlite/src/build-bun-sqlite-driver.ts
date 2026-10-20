import type { Database } from 'bun:sqlite';
import { CompiledQuery } from 'kysely';
import type { DatabaseConnection, Driver, QueryResult } from 'kysely';
import { isSQLQueryBinding } from './is-sql-query-binding.ts';
import type { SQLQueryBinding } from './is-sql-query-binding.ts';
import { toQueryRows } from './to-query-rows.ts';

// oxlint-disable zgeoff/function-verb -- Kysely's Driver interface fixes the method names

// Kysely's RuntimeDriver serializes the connection: SqliteAdapter reports no
// support for multiple connections, so RuntimeDriver holds a mutex from each
// acquire to its release.
export function buildBunSQLiteDriver(sqlite: Database): Driver {
  const connection = buildConnection(sqlite);

  // The driver's own turn chain exists only for the destroy() wait, because
  // Kysely calls destroy() outside RuntimeDriver's mutex.
  let turn: Promise<void> = Promise.resolve();
  let releaseTurn: (() => void) | undefined;

  const acquireConnection = async (): Promise<DatabaseConnection> => {
    const previous = turn;
    const next = Promise.withResolvers<void>();

    turn = next.promise;

    await previous;

    releaseTurn = next.resolve;

    return connection;
  };

  const releaseConnection = (): Promise<void> => {
    releaseTurn?.();

    return Promise.resolve();
  };

  return {
    init: () => Promise.resolve(),
    acquireConnection,
    beginTransaction: async (heldConnection) => {
      await heldConnection.executeQuery(CompiledQuery.raw('begin'));
    },
    commitTransaction: async (heldConnection) => {
      await heldConnection.executeQuery(CompiledQuery.raw('commit'));
    },
    rollbackTransaction: async (heldConnection) => {
      await heldConnection.executeQuery(CompiledQuery.raw('rollback'));
    },
    releaseConnection,

    // The opener owns the handle and closes it, so destroy() leaves the handle
    // open and only waits for the caller that holds the connection.
    destroy: async () => {
      await acquireConnection();
      await releaseConnection();
    },
  };
}

function buildConnection(sqlite: Database): DatabaseConnection {
  return {
    executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
      const stmt = sqlite.query(compiledQuery.sql);
      const bindings = toBindings(compiledQuery.parameters);

      if (stmt.columnNames.length > 0) {
        return Promise.resolve({ rows: toQueryRows<R>(stmt.all(...bindings)) });
      }

      const result = stmt.run(...bindings);

      return Promise.resolve({
        rows: [],
        numAffectedRows: BigInt(result.changes),
        insertId: BigInt(result.lastInsertRowid),
      });
    },

    streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
      throw new Error('The bun:sqlite driver does not support streaming queries');
    },
  };
}

function toBindings(parameters: readonly unknown[]): SQLQueryBinding[] {
  return parameters.map((parameter) => {
    if (!isSQLQueryBinding(parameter)) {
      const kind = Object.prototype.toString.call(parameter).slice('[object '.length, -1);

      throw new TypeError(`bun:sqlite cannot bind a parameter of type ${kind}`);
    }

    return parameter;
  });
}
