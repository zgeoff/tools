import { z } from 'zod';

// The line that the stub build prints once it has started, and that a test reads back.
export const stubBuildStartSchema = z.object({
  event: z.literal('build-started'),
  buildPid: z.number().int(),
  helperPid: z.number().int(),
});

export type StubBuildStart = z.output<typeof stubBuildStartSchema>;
