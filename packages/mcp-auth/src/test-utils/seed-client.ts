import type { ClientView, MCPAuthAdmin } from '../types.ts';

interface ClientInput {
  readonly name?: string;
  readonly redirectURIs?: readonly string[];
}

export function seedClient(
  admin: Pick<MCPAuthAdmin, 'clients'>,
  input: ClientInput = {},
): Promise<ClientView> {
  return admin.clients.add(
    input.name ?? `client-${crypto.randomUUID().slice(0, 8)}`,
    input.redirectURIs ?? ['https://client.example/callback'],
  );
}
