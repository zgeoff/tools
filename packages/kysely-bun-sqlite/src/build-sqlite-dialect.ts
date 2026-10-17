import type { Database } from 'bun:sqlite';
import { SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from 'kysely';
import type { Dialect } from 'kysely';
import { BunSQLiteDriver } from './bun-sqlite-driver.ts';

export function buildSQLiteDialect(sqlite: Database): Dialect {
  return {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new BunSQLiteDriver(sqlite),
    createIntrospector: (kysely) => new SqliteIntrospector(kysely),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  };
}
