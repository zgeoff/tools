import { z } from 'zod';

const fileHashesSchema = z.record(z.string(), z.string().nullable());

export const bashSnapshotSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('recorded'), head: z.string().nullable(), hashes: fileHashesSchema }),
  z.object({ kind: z.literal('failed'), error: z.string() }),
]);
