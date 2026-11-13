import type { SignInState } from '../sign-in/create-sign-in-state.ts';
import type { Store } from '../store/open-store.ts';
import type { MCPAuthAdmin } from '../types.ts';
import { buildClientAdmin } from './build-client-admin.ts';
import { buildGrantAdmin } from './build-grant-admin.ts';
import { buildPasskeyAdmin } from './build-passkey-admin.ts';
import { removeExpired } from './remove-expired.ts';

export function buildAdmin(
  store: Store,
  signIns: Pick<SignInState, 'removeClient'> | null,
): MCPAuthAdmin {
  return {
    clients: buildClientAdmin(store, signIns),
    grants: buildGrantAdmin(store),
    passkeys: buildPasskeyAdmin(store),
    removeExpired: () => removeExpired(store),
    close: async () => {
      await store.close();
    },
  };
}
