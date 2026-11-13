import { Database } from 'bun:sqlite';
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

  // Ends the Kysely the store built, and leaves the app's own Kysely running.
  readonly close: () => Promise<void>;
}

// A mapped type has the index signature that withTables asks for.
type StoreTables = { [Table in keyof StoreSchema]: StoreSchema[Table] };

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

  // A Kysely of the app is the app's driver and its one lock: a second Kysely
  // over the same connection has a lock of its own, so a core statement could
  // run inside an app transaction and an app rollback would undo it.
  const db: Kysely<StoreSchema> =
    admin.database instanceof Database
      ? new Kysely<StoreSchema>({ dialect: buildSQLiteDialect(admin.database) })
      : admin.database.withTables<StoreTables>();

  const close = async () => {
    if (admin.database instanceof Database) {
      await db.destroy();
    }
  };

  try {
    await checkForeignKeys(db);
    await checkUserColumns(db);

    const auth = createAuthServer({
      db,
      origin: options.origin,
      paths: options.paths,
      scopes: admin.scopes,
    });

    const migrations = await getMigrations(auth.options);

    await migrations.runMigrations();

    await createOwnedTables(db, admin.tables);
    await checkCascadeKeys(db);

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

    return { db, auth, options: kept, close };
  } catch (error) {
    await close();

    throw error;
  }
}
