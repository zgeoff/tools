import { isRecord } from '../../packages/std/src/is-record.ts';
import type { AuditIgnores } from './types.ts';

export function parseAuditIgnores(value: unknown): AuditIgnores {
  if (!isRecord(value)) {
    throw new TypeError('audit-ignores.json holds no object');
  }

  return Object.fromEntries(
    Object.entries(value).map(([advisoryID, ignore]) => {
      if (
        !isRecord(ignore) ||
        typeof ignore['package'] !== 'string' ||
        typeof ignore['reason'] !== 'string' ||
        typeof ignore['expires'] !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/u.test(ignore['expires'])
      ) {
        throw new TypeError(
          `audit-ignores.json needs a package, a reason and an ISO expires date for ${advisoryID}`,
        );
      }

      return [
        advisoryID,
        { package: ignore['package'], reason: ignore['reason'], expires: ignore['expires'] },
      ];
    }),
  );
}
