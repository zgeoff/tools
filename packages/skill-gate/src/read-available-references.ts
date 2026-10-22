import path from 'node:path';
import type { ReadFileContent, ToolGate } from './types.ts';

export async function readAvailableReferences(
  readContent: ReadFileContent,
  skillsDir: string,
  tools: readonly ToolGate[],
): Promise<readonly string[]> {
  const references = [...new Set(tools.flatMap((gate) => gate.references))];

  const contents = await Promise.all(
    references.map((reference) => readContent(path.join(skillsDir, reference))),
  );

  return references.filter((_, index) => contents[index] !== null);
}
