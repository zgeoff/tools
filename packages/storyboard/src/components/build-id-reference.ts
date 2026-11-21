import type { IDReference } from '../types.ts';

export function buildIDReference(name: string, asURL: boolean): IDReference {
  return { node: 'id', name, asURL };
}
