import { isRecord } from './is-record.ts';
import { severities } from './types.ts';
import type { Advisory, AuditReport, Severity } from './types.ts';

// Checks the shape of `bun audit --json` output and keeps the fields the step uses.
export function parseAuditReport(value: unknown): AuditReport {
  if (!isRecord(value)) {
    throw new TypeError('bun audit --json printed no object');
  }

  return Object.fromEntries(
    Object.entries(value).map(([name, advisories]) => [name, parseAdvisories(name, advisories)]),
  );
}

function parseAdvisories(name: string, value: unknown): Advisory[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`bun audit --json lists no advisories for ${name}`);
  }

  return value.map((advisory: unknown) => {
    if (
      !isRecord(advisory) ||
      typeof advisory['id'] !== 'number' ||
      typeof advisory['url'] !== 'string' ||
      typeof advisory['title'] !== 'string' ||
      typeof advisory['vulnerable_versions'] !== 'string' ||
      !isSeverity(advisory['severity'])
    ) {
      throw new TypeError(`bun audit --json has a malformed advisory for ${name}`);
    }

    return {
      id: advisory['id'],
      url: advisory['url'],
      title: advisory['title'],
      severity: advisory['severity'],
      vulnerable_versions: advisory['vulnerable_versions'],
    };
  });
}

function isSeverity(value: unknown): value is Severity {
  return severities.some((severity) => severity === value);
}
