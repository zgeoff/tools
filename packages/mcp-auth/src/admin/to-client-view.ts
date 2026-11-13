import type { StoreSchema } from '../store/store-schema.ts';
import type { ClientView } from '../types.ts';
import { parseJSONStrings } from '../utils/parse-json-strings.ts';

export function toClientView(row: StoreSchema['oauthClient']): ClientView {
  return {
    clientID: row.clientId,
    name: row.name ?? row.clientId,
    redirectURIs: parseJSONStrings(row.redirectUris) ?? [],
    createdAt: row.createdAt ?? '',
  };
}
