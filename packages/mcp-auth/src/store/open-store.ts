import { buildSQLiteDialect } from '@zgeoff/kysely-bun-sqlite';
import { getMigrations } from 'better-auth/db/migration';
import { Kysely } from 'kysely';
import type { MCPAuthAdminOptions, MCPAuthPaths } from '../types.ts';
import { checkCascadeKeys } from './check-cascade-keys.ts';
import { checkForeignKeys } from './check-foreign-keys.ts';
import { checkTableNames } from './check-table-names.ts';
import { checkUserColumns } from './check-user-columns.ts';
import { createAuthServer } from './create-auth-server.ts';
import type { AuthServer } from './create-auth-server.ts';
import { createOwnedTables } from './create-owned-tables.ts';
import type { StoreSchema } from './store-schema.ts';

export interface Store {
  readonly db: Kysely<StoreSchema>;
  readonly auth: AuthServer;
  readonly options: MCPAuthAdminOptions<string>;
}

interface StoreOptions {
  readonly origin: string | null;
  readonly paths: MCPAuthPaths;
}

// The database, better-auth over it, and the tables the core adds, checked
// for what a revoke relies on.
export async function openStore(
  admin: MCPAuthAdminOptions<string>,
  options: StoreOptions,
): Promise<Store> {
  checkTableNames(admin.tables);
  checkForeignKeys(admin.database);
  checkUserColumns(admin.database);

  const db = new Kysely<StoreSchema>({ dialect: buildSQLiteDialect(admin.database) });

  try {
    const auth = createAuthServer({
      db,
      origin: options.origin,
      paths: options.paths,
      scopes: admin.scopes,
    });

    const migrations = await getMigrations(auth.options);

    await migrations.runMigrations();

    createOwnedTables(admin.database, admin.tables);
    checkCascadeKeys(admin.database);

    // better-auth starts its context when it is built, and that start queries
    // the database, so a close before it settles destroys the driver under it.
    await auth.$context;

    // Only the admin fields stay: a full options object may hold the
    // plaintext service tokens, and the handle keeps digests only.
    const kept: MCPAuthAdminOptions<string> = {
      database: admin.database,
      scopes: admin.scopes,
      tables: admin.tables,
      clock: admin.clock,
      onGrantRevoked: admin.onGrantRevoked,
    };

    return { db, auth, options: kept };
  } catch (error) {
    await db.destroy();

    throw error;
  }
}
