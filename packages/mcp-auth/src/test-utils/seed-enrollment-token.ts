import type { MCPAuthAdmin } from '../types.ts';

export function seedEnrollmentToken(admin: Pick<MCPAuthAdmin, 'passkeys'>): Promise<string> {
  return admin.passkeys.createEnrollmentToken();
}
