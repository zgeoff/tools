import { isRecord } from '../../packages/std/src/is-record.ts';
import type { BlockedPackage, FixPlan, FixedPackage, UnfixablePackage } from './types.ts';

// Checks the shape of `bun audit fix --json` output and keeps the fields the step uses.
export function parseFixPlan(value: unknown): FixPlan {
  if (!isRecord(value)) {
    throw new TypeError('bun audit fix --json printed no object');
  }

  return {
    fixes: getList(value, 'fixes').map((entry) => parseFixedPackage(entry)),
    blocked: getList(value, 'blocked').map((entry) => parseBlockedPackage(entry)),
    unfixable: getList(value, 'unfixable').map((entry) => parseUnfixablePackage(entry)),
  };
}

function getList(plan: Record<string, unknown>, key: string): unknown[] {
  const list = plan[key];

  if (!Array.isArray(list)) {
    throw new TypeError(`bun audit fix --json has no ${key} list`);
  }

  return list;
}

function parseFixedPackage(value: unknown): FixedPackage {
  if (
    !isRecord(value) ||
    typeof value['name'] !== 'string' ||
    typeof value['from'] !== 'string' ||
    typeof value['to'] !== 'string' ||
    typeof value['newerThanMinimumReleaseAge'] !== 'boolean'
  ) {
    throw new TypeError('bun audit fix --json has a malformed fix');
  }

  return {
    name: value['name'],
    from: value['from'],
    to: value['to'],
    newerThanMinimumReleaseAge: value['newerThanMinimumReleaseAge'],
  };
}

function parseBlockedPackage(value: unknown): BlockedPackage {
  if (
    !isRecord(value) ||
    typeof value['name'] !== 'string' ||
    typeof value['from'] !== 'string' ||
    typeof value['to'] !== 'string' ||
    !Array.isArray(value['blockers'])
  ) {
    throw new TypeError('bun audit fix --json has a malformed blocked package');
  }

  return {
    name: value['name'],
    from: value['from'],
    to: value['to'],
    blockers: value['blockers'].map((blocker: unknown) => {
      if (
        !isRecord(blocker) ||
        typeof blocker['dependent'] !== 'string' ||
        typeof blocker['range'] !== 'string'
      ) {
        throw new TypeError('bun audit fix --json has a malformed blocker');
      }

      return { dependent: blocker['dependent'], range: blocker['range'] };
    }),
  };
}

function parseUnfixablePackage(value: unknown): UnfixablePackage {
  if (!isRecord(value) || typeof value['name'] !== 'string') {
    throw new TypeError('bun audit fix --json has a malformed unfixable package');
  }

  return { name: value['name'] };
}
