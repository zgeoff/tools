import { z } from 'zod';

// The record that the hook writes before a Bash command and reads after it, in two processes.
export const bashSnapshotSchema = z.object({
  head: z.string().nullable(),
  hashes: z.record(z.string(), z.string().nullable()),
});
