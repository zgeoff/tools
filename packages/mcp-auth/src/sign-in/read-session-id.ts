import type { Store } from '../store/open-store.ts';

export async function readSessionID(store: Store, cookie: string | null): Promise<string | null> {
  if (cookie === null || cookie === '') {
    return null;
  }

  const found = await store.auth.api.getSession({ headers: new Headers({ cookie }) });

  return found === null ? null : found.session.id;
}
