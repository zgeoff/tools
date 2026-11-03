import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord } from '@zgeoff/std';
import { buildProgramVariable } from '../build-program-environment.ts';
import { parseRigConfig } from '../parse-rig-config.ts';
import type { ProgramDeclaration } from '../types.ts';
import { resolveRepoRoot } from './resolve-repo-root.ts';

export interface ProgramLaunch {
  readonly command: readonly string[];

  // The folder to run in when the caller names none.
  readonly cwd: string;
}

export interface ProgramLaunchSources {
  readonly environment: Readonly<Record<string, string | undefined>>;

  readonly cwd: string;

  readonly importModule: (path: string) => Promise<unknown>;

  readonly probeFile: (path: string) => boolean;
}

export function readLaunchSources(): ProgramLaunchSources {
  return {
    environment: process.env,
    cwd: process.cwd(),
    importModule: (path) => import(path),
    probeFile: existsSync,
  };
}

// `rig e2e` builds the program and names its artifact in the environment. Outside CI, a test
// without that variable runs the source with bun, so the file runs under `bun test` with no build.
export async function resolveProgramLaunch(
  name: string,
  sources: ProgramLaunchSources,
): Promise<ProgramLaunch> {
  const artifact = sources.environment[buildProgramVariable(name)];

  if (artifact !== undefined && artifact !== '') {
    return {
      command: /\.(?:js|ts)$/u.test(artifact) ? ['bun', artifact] : [artifact],
      cwd: sources.cwd,
    };
  }

  const ci = sources.environment['CI'];

  if (ci !== undefined && ci !== '') {
    throw new Error(`program ${name} isn't built: run the e2e lane with rig e2e`);
  }

  const repoRoot = resolveRepoRoot(sources.cwd, sources.probeFile);

  const program = await readProgram(name, repoRoot, sources);

  return {
    command: ['bun', join(repoRoot, program.package, program.source)],
    cwd: repoRoot,
  };
}

async function readProgram(
  name: string,
  repoRoot: string,
  sources: ProgramLaunchSources,
): Promise<ProgramDeclaration> {
  const path = join(repoRoot, 'rig.config.ts');

  const loaded = await sources.importModule(path);

  const defaultExport = isRecord(loaded) ? loaded['default'] : null;
  const parsed = parseRigConfig(defaultExport);

  if (parsed.kind === 'refused') {
    throw new Error(`${path} must default-export the result of defineRig: ${parsed.reason}`);
  }

  const program = Object.hasOwn(parsed.config.programs, name)
    ? parsed.config.programs[name]
    : undefined;

  if (program === undefined) {
    throw new Error(`program ${name} isn't declared: add it to rig.config.ts programs`);
  }

  return program;
}
