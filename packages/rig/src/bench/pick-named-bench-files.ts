import { toBenchName } from './to-bench-name.ts';

export function pickNamedBenchFiles(
  benchFiles: readonly string[],
  name: string | null,
): readonly string[] {
  return name === null ? benchFiles : benchFiles.filter((file) => toBenchName(file) === name);
}
