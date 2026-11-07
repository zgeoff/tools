import type { DependencyGateFinding, LockfileDependent } from './types.ts';

interface UnneededOverridesInput {
  readonly overrides: Readonly<Record<string, string>>;
  readonly catalog: Readonly<Record<string, string>>;
  readonly catalogs: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly dependents: readonly LockfileDependent[];
}

export function collectUnneededOverrides(input: UnneededOverridesInput): DependencyGateFinding[] {
  return Object.entries(input.overrides).flatMap(([key, pin]) => {
    const target = parseOverrideKey(key);

    if (target === null) {
      return [
        {
          path: 'package.json',
          entry: key,
          problem: 'bun ignores an override key with more than one parent level',
        },
      ];
    }

    const ranges = input.dependents
      .filter(
        (dependent) =>
          dependent.name === target.name && isDependentOfParent(dependent, target.parent),
      )
      .map((dependent) => resolveCatalogRange(input, target.name, dependent.range));

    if (ranges.length === 0) {
      return [
        {
          path: 'package.json',
          entry: key,
          problem: 'no package in bun.lock depends on the overridden package',
        },
      ];
    }

    const isPinOutsideARange = ranges.some(
      (range) => !isSemverRange(range) || !Bun.semver.satisfies(pin, range),
    );

    const isPinTheCatalogVersion = input.catalog[target.name] === pin;

    if (isPinOutsideARange || isPinTheCatalogVersion) {
      return [];
    }

    return [
      {
        path: 'package.json',
        entry: key,
        problem: `every range in bun.lock already admits ${pin}, so the override changes nothing`,
      },
    ];
  });
}

interface PackageSpec {
  readonly name: string;
  readonly range: string | null;
}

interface OverrideTarget {
  readonly name: string;
  readonly parent: PackageSpec | null;
}

// Bun splits a key at the first `>` that follows no space, `|`, `@` or `:`, so the `>` of a range
// such as `left-pad@>=1` stays in the range.
const parentSeparatorPattern = /[^ |@:]>/u;

// A child range, as in `terser@4`, narrows the dependents bun applies the key to. The check keeps
// every dependent of the name, so a narrower key can only look more needed, never less.
function parseOverrideKey(key: string): OverrideTarget | null {
  const separator = parentSeparatorPattern.exec(key);

  if (separator === null) {
    return { name: parsePackageSpec(key).name, parent: null };
  }

  const separatorIndex = separator.index + 1;
  const child = key.slice(separatorIndex + 1).trim();

  if (parentSeparatorPattern.test(child)) {
    return null;
  }

  return {
    name: parsePackageSpec(child).name,
    parent: parsePackageSpec(key.slice(0, separatorIndex).trim()),
  };
}

// A scoped name starts with `@`, so the range starts at the next `@`.
function parsePackageSpec(spec: string): PackageSpec {
  const rangeIndex = spec.indexOf('@', 1);

  if (rangeIndex === -1) {
    return { name: spec, range: null };
  }

  return { name: spec.slice(0, rangeIndex), range: spec.slice(rangeIndex + 1) };
}

function isDependentOfParent(dependent: LockfileDependent, parent: PackageSpec | null): boolean {
  if (parent === null) {
    return true;
  }

  const id = parsePackageSpec(dependent.dependent);

  if (id.name !== parent.name) {
    return false;
  }

  return parent.range === null || id.range === null || Bun.semver.satisfies(id.range, parent.range);
}

// bun.lock keeps a workspace's `catalog:` reference as it is written in its package.json.
function resolveCatalogRange(input: UnneededOverridesInput, name: string, range: string): string {
  if (!range.startsWith('catalog:')) {
    return range;
  }

  const catalogName = range.slice('catalog:'.length);
  const catalog = catalogName === '' ? input.catalog : input.catalogs[catalogName];

  return catalog?.[name] ?? range;
}

const comparatorPattern =
  /^(?:[<>]=?|=|\^|~)?v?(?:\d+|[*Xx])(?:\.(?:\d+|[*Xx])){0,2}(?:-[\w.-]+)?(?:\+[\w.-]+)?$/u;

// Bun.semver.satisfies reads a range it cannot parse, such as a dist-tag, a `workspace:` or `npm:`
// protocol or a git URL, as any version, so only a range of plain comparators can admit the pin.
function isSemverRange(range: string): boolean {
  return range.split('||').every((part) =>
    part
      .trim()
      .split(/\s+/u)
      .every((token) => token === '' || token === '-' || comparatorPattern.test(token)),
  );
}
