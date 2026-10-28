import assert from 'node:assert/strict';

export function parseAuditIgnoreIDs(auditScript: string): string[] {
  return [...auditScript.matchAll(/--ignore[= ](?<advisoryID>\S+)/gu)].map((match) => {
    const advisoryID = match.groups?.['advisoryID'];

    assert.ok(advisoryID !== undefined, 'the ignore pattern names the advisory');

    return advisoryID;
  });
}
