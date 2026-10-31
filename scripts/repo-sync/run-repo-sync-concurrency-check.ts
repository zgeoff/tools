import { nodeFileSystem } from '../ci/node-file-system.ts';
import { collectRepoSyncConcurrencyFaults } from './collect-repo-sync-concurrency-faults.ts';

export interface RepoSyncConcurrencyCheckOptions {
  readonly readStub: () => Promise<string>;

  readonly readWorkflow: () => Promise<string>;

  readonly writeOutput: (text: string) => void;

  readonly writeError: (text: string) => void;
}

// Returns the exit code: 0 with no fault, 1 with faults, 2 when a workflow cannot be read or
// parsed.
export async function runRepoSyncConcurrencyCheck(
  options: RepoSyncConcurrencyCheckOptions,
): Promise<number> {
  try {
    const stubText = await options.readStub();
    const workflowText = await options.readWorkflow();

    const faults = collectRepoSyncConcurrencyFaults(stubText, workflowText);

    for (const fault of faults) {
      options.writeOutput(`${fault}\n`);
    }

    return faults.length === 0 ? 0 : 1;
  } catch (error) {
    options.writeError(
      `repo-sync-concurrency: ${error instanceof Error ? error.message : String(error)}\n`,
    );

    return 2;
  }
}

async function runCLI(): Promise<void> {
  process.exitCode = await runRepoSyncConcurrencyCheck({
    readStub: () => nodeFileSystem.readText('sync/repo-sync.yml'),
    readWorkflow: () => nodeFileSystem.readText('.github/workflows/repo-sync.yml'),
    writeOutput: (text) => {
      process.stdout.write(text);
    },
    writeError: (text) => {
      process.stderr.write(text);
    },
  });
}

if (import.meta.main) {
  await runCLI();
}
