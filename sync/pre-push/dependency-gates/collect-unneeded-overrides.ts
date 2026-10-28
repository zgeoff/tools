import type { DependencyGateFinding, LockfileDependent } from './types.ts';

interface UnneededOverridesInput {
  readonly overrides: Readonly<Record<string, string>>;
  readonly catalog: Readonly<Record<string, string>>;
  readonly dependents: readonly LockfileDependent[];
}

export function collectUnneededOverrides(input: UnneededOverridesInput): DependencyGateFinding[] {
  return Object.entries(input.overrides).flatMap(([name, pin]) => {
    const ranges = input.dependents
      .filter((dependent) => dependent.name === name)
      .map((dependent) => dependent.range);

    if (ranges.length === 0) {
      return [
        {
          path: 'package.json',
          entry: name,
          problem: 'no package in bun.lock depends on the overridden package',
        },
      ];
    }

    const isPinOutsideARange = ranges.some((range) => !Bun.semver.satisfies(pin, range));
    const isPinTheCatalogVersion = input.catalog[name] === pin;

    if (isPinOutsideARange || isPinTheCatalogVersion) {
      return [];
    }

    return [
      {
        path: 'package.json',
        entry: name,
        problem: `every range in bun.lock already admits ${pin}, so the override changes nothing`,
      },
    ];
  });
}
