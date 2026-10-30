import { match } from 'ts-pattern';
import type { Harness } from '../harness.ts';
import type { HarnessWording } from './types.ts';

// How each harness loads a skill, reads a file and edits one, for the text the gate sends the agent.
export function pickHarnessWording(harness: Harness | undefined): HarnessWording {
  return match(harness ?? 'claude-code')
    .returnType<HarnessWording>()
    .with('claude-code', () => ({
      loadSkill: 'with the Skill tool',
      readFile: 'with the Read tool',
      editTools: 'Edit, Write or MultiEdit',
    }))
    .with('codex', () => ({
      loadSkill:
        'by reading its SKILL.md with cat, for example `cat .agents/skills/<name>/SKILL.md`',
      readFile: 'with cat',
      editTools: 'apply_patch',
    }))
    .exhaustive();
}
