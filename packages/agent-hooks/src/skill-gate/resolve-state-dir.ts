import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SessionState } from './types.ts';

// Claude Code keeps a session's own files in <session>/ beside its transcript, which a git status
// of the project never lists. Codex does the same beside its rollout file, and a session with no
// rollout file keeps them in the temp folder.
export function resolveStateDir(hookInput: SessionState): string | null {
  if (hookInput.transcriptPath !== null) {
    const sessionDir = hookInput.transcriptPath.replace(/\.jsonl$/u, '');
    const folder = sessionDir === hookInput.transcriptPath ? `${sessionDir}.d` : sessionDir;

    return path.join(folder, 'skill-gate');
  }

  if (hookInput.sessionID === null || !/^[\w-]+$/u.test(hookInput.sessionID)) {
    return null;
  }

  return path.join(tmpdir(), 'skill-gate', hookInput.sessionID);
}

// Codex has no transcript the gate can read, so it keeps its own ledger of what the session loaded.
export function resolveLedgerPath(hookInput: SessionState): string | null {
  const stateDir = resolveStateDir(hookInput);

  if (stateDir === null || hookInput.sessionID === null || !/^[\w-]+$/u.test(hookInput.sessionID)) {
    return null;
  }

  return path.join(stateDir, `loads-${hookInput.sessionID}.json`);
}
