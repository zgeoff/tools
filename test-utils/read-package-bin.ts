import { join } from 'node:path';
import { z } from 'zod';

const manifestSchema = z.object({ bin: z.record(z.string(), z.string()) });

export async function readPackageBin(packageDir: string, commandName: string): Promise<string> {
  const manifestPath = join(packageDir, 'package.json');

  const manifest: unknown = await Bun.file(manifestPath).json();

  const parsed = manifestSchema.safeParse(manifest);
  const binPath = parsed.success ? parsed.data.bin[commandName] : undefined;

  if (binPath === undefined) {
    throw new Error(`${manifestPath} declares no bin named ${commandName}`);
  }

  return join(packageDir, binPath);
}
