import { match } from 'ts-pattern';
import { collectSessionLoads } from './collect-session-loads.ts';
import { readLoadLedger } from './load-ledger.ts';
import { readSessionTranscript } from './read-session-transcript.ts';
import { resolveLedgerPath } from './resolve-state-dir.ts';
import type { HookInput, SessionLoads } from './types.ts';

export function readSessionLoads(hookInput: HookInput): Promise<SessionLoads> {
  return match(hookInput.harness)
    .with('claude-code', () => readClaudeLoads(hookInput))
    .with('codex', () => readLoadLedger(resolveLedgerPath(hookInput)))
    .exhaustive();
}

async function readClaudeLoads(hookInput: HookInput): Promise<SessionLoads> {
  const transcript = await readSessionTranscript(hookInput);

  return collectSessionLoads(transcript);
}
