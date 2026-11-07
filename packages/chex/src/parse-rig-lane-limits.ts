import { findMember } from './find-member.ts';

export type ParsedRigLaneLimits =
  | { readonly kind: 'parsed'; readonly limits: ReadonlyMap<string, number> }
  | { readonly kind: 'refused'; readonly reason: string };

// The CI step downloads the check without rig, so the check reads rig.config.ts's default export
// field by field. defineRig resolves every standard lane into its lanes, each with its limit in ms.
export function parseRigLaneLimits(rigConfig: unknown): ParsedRigLaneLimits {
  const lanes = findMember(rigConfig, 'lanes');

  if (!Array.isArray(lanes)) {
    return { kind: 'refused', reason: 'its default export has no list of lanes' };
  }

  const limits = new Map<string, number>();

  for (const [index, lane] of lanes.entries()) {
    const name = findMember(lane, 'name');
    const limitMs = findMember(lane, 'limitMs');

    if (typeof name !== 'string' || typeof limitMs !== 'number') {
      return { kind: 'refused', reason: `lane ${index} lacks a name or a limitMs` };
    }

    limits.set(name, limitMs);
  }

  return { kind: 'parsed', limits };
}
