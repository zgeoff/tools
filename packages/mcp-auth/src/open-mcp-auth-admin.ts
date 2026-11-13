import { buildAdmin } from './admin/build-admin.ts';
import { DEFAULT_PATHS } from './default-paths.ts';
import { openStore } from './store/open-store.ts';
import type { MCPAuthAdmin, MCPAuthAdminOptions } from './types.ts';

// An admin command opens the database with no origin, and gets only the admin
// calls.
export async function openMCPAuthAdmin<Scope extends string>(
  options: MCPAuthAdminOptions<Scope>,
): Promise<MCPAuthAdmin> {
  const store = await openStore(options, { origin: null, paths: DEFAULT_PATHS });

  return buildAdmin(store, null);
}
