import { isRecord } from '../../../packages/std/src/is-record.ts';

interface CycleWalk {
  readonly graph: ReadonlyMap<string, readonly string[]>;

  // Packages that an earlier start already covered, so each cycle is reported once.
  readonly done: Set<string>;

  readonly cycles: string[][];
}

// release-please's node-workspace plugin orders the releases by the dependency graph of the
// workspace packages, counting every dependency field, and fails on a cycle. Each cycle comes back
// as the package names around it, with its first name repeated at the end, such as ['a', 'b', 'a'].
export function collectWorkspaceCycles(manifests: readonly unknown[]): readonly string[][] {
  const walk: CycleWalk = { graph: buildDependencyGraph(manifests), done: new Set(), cycles: [] };

  for (const start of walk.graph.keys()) {
    collectCyclesFrom([start], walk);

    walk.done.add(start);
  }

  return walk.cycles;
}

const dependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

function buildDependencyGraph(manifests: readonly unknown[]): Map<string, readonly string[]> {
  const names = new Set(manifests.flatMap((manifest) => toPackageNames(manifest)));
  const graph = new Map<string, readonly string[]>();

  for (const manifest of manifests) {
    if (!isRecord(manifest) || typeof manifest['name'] !== 'string') {
      continue;
    }

    const targets = dependencyFields.flatMap((field) => {
      const entries = manifest[field];

      return isRecord(entries) ? Object.keys(entries) : [];
    });

    graph.set(
      manifest['name'],
      [...new Set(targets.filter((target) => names.has(target)))].toSorted(),
    );
  }

  return graph;
}

function toPackageNames(manifest: unknown): readonly string[] {
  return isRecord(manifest) && typeof manifest['name'] === 'string' ? [manifest['name']] : [];
}

function collectCyclesFrom(path: readonly string[], walk: CycleWalk): void {
  const current = path.at(-1) ?? '';

  for (const next of walk.graph.get(current) ?? []) {
    if (next === path[0]) {
      walk.cycles.push([...path, next]);
    } else if (!path.includes(next) && !walk.done.has(next)) {
      collectCyclesFrom([...path, next], walk);
    }
  }
}
