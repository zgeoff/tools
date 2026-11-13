import type { ApprovedBy } from '../types.ts';

export function parseApprovedBy(text: string): ApprovedBy | null {
  if (text === 'passkey') {
    return text;
  }

  return text.startsWith('token:') ? `token:${text.slice('token:'.length)}` : null;
}
