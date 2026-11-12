import { z } from 'zod';

export type ParsedDepartures =
  | { readonly kind: 'parsed'; readonly folders: readonly string[] }
  | { readonly kind: 'refused'; readonly reason: string };

const folderPattern = /^(?:(?!\.\.?\/)[^/]+\/)+$/u;

const departureSchema = z.strictObject({
  path: z
    .string()
    .regex(folderPattern, 'give a folder relative to the repo root, ending in /, such as e2e/'),
  reason: z.string().trim().min(1, 'give the reason the repo keeps its tests in this folder'),
});

const testLayoutSchema = z.strictObject({ departures: z.array(departureSchema) });

// A strict object fails a misspelt key, which would otherwise drop the departures without a word.
const manifestSchema = z.object({
  chex: z.strictObject({ testLayout: testLayoutSchema.optional() }).optional(),
});

// Reads `chex.testLayout.departures` of the root package.json: each a folder path relative to the
// repo root that ends in a slash, such as `e2e/`, with the reason the repo keeps it there. The
// folders come back without the slash.
export function parseTestLayoutDepartures(manifest: unknown): ParsedDepartures {
  const parsed = manifestSchema.safeParse(manifest);

  if (!parsed.success) {
    return { kind: 'refused', reason: parsed.error.issues.map(formatIssue).join('; ') };
  }

  const departures = parsed.data.chex?.testLayout?.departures ?? [];

  return { kind: 'parsed', folders: departures.map((departure) => departure.path.slice(0, -1)) };
}

function formatIssue(issue: z.core.$ZodIssue): string {
  return `${issue.path.join('.')}: ${issue.message}`;
}
