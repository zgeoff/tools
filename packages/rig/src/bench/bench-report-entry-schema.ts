import { z } from 'zod';

// One line of the report that a bench file process appends for `rig bench` to read: one benchmark
// at one concurrency level.
export const benchReportEntrySchema = z
  .object({
    // Two bench files can define benchmarks of the same name, so the file tells them apart.
    file: z.string(),
    name: z.string(),
    concurrency: z.number(),
    medianMs: z.number(),
    spreadMs: z.number(),
    budgetMs: z.number(),
  })
  .readonly();

export type BenchReportEntry = z.infer<typeof benchReportEntrySchema>;
