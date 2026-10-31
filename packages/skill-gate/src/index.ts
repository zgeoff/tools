import { runAgentHook } from '@zgeoff/agent-hooks';
import type { Harness } from '@zgeoff/agent-hooks';

export type { Harness } from '@zgeoff/agent-hooks';

export function runSkillGate(harness: Harness = 'claude-code'): Promise<never> {
  return runAgentHook({ harness });
}
