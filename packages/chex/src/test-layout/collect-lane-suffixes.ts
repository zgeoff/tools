import { parseLaneLimits } from '../parse-lane-limits.ts';

// The suffixes that a test file name may carry before `.test.ts`. A lane of the resolved
// rig.config.ts has exactly the suffix it gives, and a lane only the oxlint config names has
// `.<lane>`. The e2e lane selects by folder, so it has none.
export function collectLaneSuffixes(
  oxlintConfigText: string | null,
  rigConfig: unknown,
): readonly string[] {
  const resolved = collectResolvedSuffixes(rigConfig);
  const names = [...parseLaneLimits(oxlintConfigText).keys()].filter((name) => name !== 'e2e');

  const fromNames = names.flatMap((name): string[] => {
    const suffix = resolved.has(name) ? resolved.get(name) : `.${name}`;

    return typeof suffix === 'string' ? [suffix] : [];
  });

  const fromConfig = [...resolved.values()].filter((suffix): suffix is string => suffix !== null);

  return [...new Set([...fromNames, ...fromConfig])].toSorted();
}

// The suffix of each lane of the resolved rig.config.ts, by lane name; null for a lane without one.
function collectResolvedSuffixes(rigConfig: unknown): Map<string, string | null> {
  const lanes: unknown =
    typeof rigConfig === 'object' && rigConfig !== null
      ? Reflect.get(rigConfig, 'lanes')
      : undefined;

  const suffixes = new Map<string, string | null>();

  if (!Array.isArray(lanes)) {
    return suffixes;
  }

  for (const entry of lanes) {
    const lane: unknown = entry;

    if (typeof lane !== 'object' || lane === null) {
      continue;
    }

    const name: unknown = Reflect.get(lane, 'name');
    const suffix: unknown = Reflect.get(lane, 'suffix');
    const laneSuffix = typeof suffix === 'string' ? suffix : null;

    if (typeof name === 'string') {
      suffixes.set(name, laneSuffix);
    }
  }

  return suffixes;
}
