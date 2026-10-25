import path from 'node:path';
import type { HookInput } from './types.ts';

// A subagent's call carries the main session's transcript_path plus its own agent_id, and Claude
// Code keeps its transcript in <session>/subagents/, under workflows/<workflow_id>/ when a workflow
// started it.
export async function readSessionTranscript(hookInput: HookInput): Promise<string> {
  if (hookInput.transcriptPath === null) {
    return '';
  }

  if (hookInput.agentID === undefined) {
    return readTranscript(hookInput.transcriptPath);
  }

  if (typeof hookInput.agentID !== 'string' || !/^[\w-]+$/u.test(hookInput.agentID)) {
    return '';
  }

  const subagentsDir = path.join(hookInput.transcriptPath.replace(/\.jsonl$/u, ''), 'subagents');
  const transcriptName = `agent-${hookInput.agentID}.jsonl`;

  const agentTranscript = await readTranscript(path.join(subagentsDir, transcriptName));

  if (agentTranscript !== '') {
    return agentTranscript;
  }

  return readWorkflowAgentTranscript(subagentsDir, transcriptName);
}

async function readTranscript(transcriptPath: string): Promise<string> {
  const transcriptFile = Bun.file(transcriptPath);

  const exists = await transcriptFile.exists();

  return exists ? transcriptFile.text() : '';
}

async function readWorkflowAgentTranscript(
  subagentsDir: string,
  transcriptName: string,
): Promise<string> {
  const scan = new Bun.Glob(`workflows/*/${transcriptName}`).scan({ cwd: subagentsDir });

  let transcriptPath: string | null = null;

  try {
    for await (const scannedPath of scan) {
      transcriptPath = scannedPath;
      break;
    }
  } catch {
    // Bun's glob scan throws ENOENT when its cwd is missing, as for a session with no subagents.
  }

  return transcriptPath === null ? '' : readTranscript(path.join(subagentsDir, transcriptPath));
}
