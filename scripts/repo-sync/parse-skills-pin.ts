import { isRecord } from '../../packages/std/src/is-record.ts';

// Returns the pinned commit of zgeoff/skills, or null when the value is no pin with a full commit ID.
export function parseSkillsPin(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const commit = value['commit'];

  return typeof commit === 'string' && /^[0-9a-f]{40}$/u.test(commit) ? commit : null;
}
