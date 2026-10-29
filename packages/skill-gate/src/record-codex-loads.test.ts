import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLoadLedger } from './load-ledger.ts';
import { recordCommandReads } from './record-codex-loads.ts';
import { resolveLedgerPath } from './resolve-state-dir.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'record-codex-loads-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const project = join(directory, 'project');

  await mkdir(project);

  return { directory, project };
}

test('it keeps every skill read when many reads record at once', async () => {
  const ctx = await setupTest();

  const names = Array.from({ length: 12 }, (_, index) => `skill-${index}`);

  for (const name of names) {
    await mkdir(join(ctx.project, '.agents/skills', name), { recursive: true });
    await writeFile(join(ctx.project, '.agents/skills', name, 'SKILL.md'), `# ${name}\n`);
  }

  const input = {
    kind: 'tool',
    harness: 'codex',
    event: 'PostToolUse',
    toolName: 'Bash',
    cwd: ctx.project,
    editPaths: [],
    command: null,
    transcriptPath: join(ctx.directory, 'rollout-1.jsonl'),
    sessionID: 'session-1',
    toolUseID: 'call-1',
    agentID: undefined,
  } as const;

  await Promise.all(
    names.map((name) =>
      recordCommandReads(input, `cat .agents/skills/${name}/SKILL.md`, ctx.project, '{"gates":[]}'),
    ),
  );

  const ledger = await readLoadLedger(resolveLedgerPath(input));

  expect(ledger.skills).toIncludeSameMembers(names);
});
