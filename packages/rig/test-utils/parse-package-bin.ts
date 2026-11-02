import { z } from 'zod';

const manifestSchema = z.object({ bin: z.record(z.string(), z.string()) });

export function parsePackageBin(manifest: unknown, commandName: string): string | null {
  const parsed = manifestSchema.safeParse(manifest);

  return (parsed.success ? parsed.data.bin[commandName] : undefined) ?? null;
}
