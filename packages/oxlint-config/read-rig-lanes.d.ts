export interface RigLaneSources {
  readonly resolveRepoRoot: (filename: string) => string | null;
  readonly probeFile: (path: string) => boolean;
  readonly importModule: (url: string) => Promise<unknown>;
  readonly resolveRepoRig: (root: string) => string;
}

export default function readRigLanes(
  cwd: string,
  dependencies: RigLaneSources,
): Promise<Map<string, number> | null>;
