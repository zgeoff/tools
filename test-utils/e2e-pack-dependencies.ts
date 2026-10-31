import type { LaneFiles } from '../packages/rig/src/browser/lane-files.ts';
import type { PackedBinFiles } from './read-packed-bin.ts';

// The effects that the e2e lane's start and stop hooks reach, which the lane entrypoints pass in.
export interface E2EPackDependencies {
  readonly hostName: string;

  readonly tempDir: string;

  readonly userID: number;

  readonly files: Pick<LaneFiles, 'createDirs' | 'readDirNames' | 'removePath'>;

  readonly packedFiles: PackedBinFiles;

  readonly probeProcess: (processID: number) => boolean;

  // Runs the command in the folder, and rejects with its stderr when it exits nonzero.
  readonly runCommand: (command: readonly string[], cwd: string) => Promise<void>;
}
