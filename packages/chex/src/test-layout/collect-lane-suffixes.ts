import { parseLaneLimits } from '../parse-lane-limits.ts';

// The suffixes that a test file name may carry before `.test.ts`: the standard lanes and the lanes
// of the oxlint config, each as `.<lane>`, and the suffix of each lane that the resolved
// rig.config.ts holds. The e2e lane selects by folder, so it has none.
export function collectLaneSuffixes(
  oxlintConfigText: string | null,
  rigConfig: unknown,
): readonly string[] {
  const names = [...parseLaneLimits(oxlintConfigText).keys()].filter((name) => name !== 'e2e');

  const lanes: unknown =
    typeof rigConfig === 'object' && rigConfig !== null
      ? Reflect.get(rigConfig, 'lanes')
      : undefined;

  const rigSuffixes = Array.isArray(lanes)
    ? lanes.flatMap((lane: unknown): string[] => {
        const suffix: unknown =
          typeof lane === 'object' && lane !== null ? Reflect.get(lane, 'suffix') : undefined;

        return typeof suffix === 'string' ? [suffix] : [];
      })
    : [];

  return [...new Set([...names.map((name) => `.${name}`), ...rigSuffixes])].toSorted();
}
