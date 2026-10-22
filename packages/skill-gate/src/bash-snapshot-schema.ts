import { z } from 'zod';

const fileHashesSchema = z.record(z.string(), z.string().nullable());

// The record that the hook writes before a Bash command and reads after it, in two processes.
// A failed record keeps git's error, so the check after the command can report it.
export const bashSnapshotSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('recorded'), head: z.string().nullable(), hashes: fileHashesSchema }),
  z.object({ kind: z.literal('failed'), error: z.string() }),
]);
