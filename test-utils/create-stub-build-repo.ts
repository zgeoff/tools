import { join } from 'node:path';
import { hasErrorCode } from '../packages/rig/src/browser/has-error-code.ts';
import { readStreamUntil } from './read-stream-until.ts';
import type { StubBuildStart } from './stub-build-start.ts';
import { stubBuildStartSchema } from './stub-build-start.ts';
import type { TemplateFiles } from './template-files.ts';
import type { TestProcesses } from './test-processes.ts';

export interface StubBuildRepo {
  // Reads the lane's output until the build reports that it started.
  readonly readStart: (stdout: ReadableStream<Uint8Array>) => Promise<StubBuildStart>;

  // Stops the process group of a build that started, whether or not it reported its start.
  readonly stop: () => Promise<void>;
}

const stubBuildProgramPath = join(import.meta.dir, 'run-stub-build.ts');

// A repo whose build:browser script runs the stub build program with the marker file and the
// process ID file.
export async function createStubBuildRepo(
  repoRoot: string,
  markerPath: string,
  processes: Pick<TestProcesses, 'readGroupID' | 'signalGroup'>,
  files: Pick<TemplateFiles, 'createDirectories' | 'readFile' | 'writeFile'>,
): Promise<StubBuildRepo> {
  const pidPath = join(repoRoot, 'build.pid');

  const script = ['bun', stubBuildProgramPath, '--marker', markerPath, '--pid-file', pidPath].map(
    (word) => quoteShellWord(word),
  );

  await files.createDirectories(repoRoot);

  await files.writeFile(
    join(repoRoot, 'package.json'),
    JSON.stringify({ scripts: { 'build:browser': script.join(' ') } }),
  );

  return {
    readStart: async (stdout) => {
      const output = await readStreamUntil(stdout, '}\n\n');

      const line = output.split('\n').find((candidate) => candidate.startsWith('{'));

      if (line === undefined) {
        throw new Error(`the stub build never reported its start:\n${output}`);
      }

      const message: unknown = JSON.parse(line);

      return stubBuildStartSchema.parse(message);
    },
    stop: async () => {
      const pidFile = await readPIDFile(pidPath, files);

      if (pidFile === null) {
        return;
      }

      const groupID = processes.readGroupID(Number(pidFile));

      if (groupID !== null) {
        processes.signalGroup(groupID, 'SIGKILL');
      }
    },
  };
}

function quoteShellWord(word: string): string {
  return `'${word.replaceAll("'", String.raw`'\''`)}'`;
}

async function readPIDFile(
  pidPath: string,
  files: Pick<TemplateFiles, 'readFile'>,
): Promise<string | null> {
  try {
    const bytes = await files.readFile(pidPath);

    return new TextDecoder().decode(bytes);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return null;
    }

    throw error;
  }
}
