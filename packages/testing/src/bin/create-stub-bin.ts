import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readStubCalls } from './read-stub-calls.ts';
import type { StubBin, StubBinOptions, StubConfig } from './types.ts';

// Writes a stand-in for a command into the folder, to go first on PATH. It answers each call from
// the answers, or runs the script, and logs every call to the folder's calls.jsonl. A second call
// for a name replaces that stand-in whole, and keeps the log.
export function createStubBin(
  directory: string,
  name: string,
  options: StubBinOptions = {},
): StubBin {
  const script = 'script' in options ? options.script : null;

  const config: StubConfig = {
    answers: 'answers' in options ? (options.answers ?? null) : null,
    hasScript: script !== null,
    recordEnv: options.recordEnv ?? [],
    recordStdin: options.recordStdin ?? false,
  };

  mkdirSync(directory, { recursive: true });
  writeStaged(join(directory, `.${name}.config.json`), JSON.stringify(config), 0o644);
  writeStaged(join(directory, `.${name}.state.json`), '[]', 0o644);

  if (script === null) {
    rmSync(join(directory, `.${name}.script`), { force: true });
  } else {
    writeStaged(join(directory, `.${name}.script`), script, 0o755);
  }

  const runtime = readFileSync(join(import.meta.dir, 'stub-runtime.ts'), 'utf8');
  const path = join(directory, name);

  writeStaged(path, `#!${process.execPath}\n${runtime}`, 0o755);

  return {
    path,
    readCalls: () => readStubCalls(directory).filter((call) => call.name === name),
  };
}

// Writes to a new name in the same folder and renames it into place. A process that still runs the
// old file keeps its inode, so the write never fails with ETXTBSY.
function writeStaged(path: string, content: string, mode: number): void {
  const staged = `${path}.staged-${crypto.randomUUID()}`;

  writeFileSync(staged, content);
  chmodSync(staged, mode);
  renameSync(staged, path);
}
