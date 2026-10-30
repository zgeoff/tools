import { match } from 'ts-pattern';
import type { Harness } from '../harness.ts';
import { buildPatchGateOutput } from './build-patch-gate-output.ts';
import { buildSkillGateOutput } from './build-skill-gate-output.ts';
import type { EditEntry, SkillGateHookOutput, SkillGateOutputContext } from './types.ts';

export function buildEditOutput(
  harness: Harness,
  entries: readonly EditEntry[],
  context: SkillGateOutputContext,
): SkillGateHookOutput | null {
  return match(harness)
    .with('claude-code', () => {
      const [first] = entries;

      return first === undefined ? null : buildSkillGateOutput(first.filePath, first.plan, context);
    })
    .with('codex', () => buildPatchGateOutput(entries, { ...context, harness }))
    .exhaustive();
}
