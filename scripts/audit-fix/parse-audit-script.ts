import { severities } from './types.ts';
import type { Severity } from './types.ts';

interface AuditScript {
  readonly ignoreIDs: readonly string[];
  readonly auditLevel: Severity | null;
}

// Reads the --ignore and --audit-level flags of a package.json `audit` script,
// in both the `--flag=value` and the `--flag value` forms.
export function parseAuditScript(script: string): AuditScript {
  const tokens = script.trim().split(/\s+/u);
  const ignoreIDs: string[] = [];
  let auditLevel: Severity | null = null;

  for (const [index, token] of tokens.entries()) {
    const ignore = readFlagValue(tokens, index, '--ignore');

    if (ignore !== null) {
      ignoreIDs.push(ignore);
    }

    const level = readFlagValue(tokens, index, '--audit-level');

    if (level !== null) {
      if (!isSeverity(level)) {
        throw new Error(`the audit script sets an unknown --audit-level: ${level}`);
      }

      auditLevel = level;
    }

    if (token === '&&' || token === ';' || token === '|') {
      throw new Error(`the audit script must be one bun audit command, not a chain: ${script}`);
    }
  }

  return { ignoreIDs, auditLevel };
}

function readFlagValue(tokens: readonly string[], index: number, flag: string): string | null {
  const token = tokens[index];

  if (token === undefined) {
    return null;
  }

  if (token.startsWith(`${flag}=`)) {
    return token.slice(flag.length + 1);
  }

  return token === flag ? (tokens[index + 1] ?? null) : null;
}

function isSeverity(value: string): value is Severity {
  return (severities as readonly string[]).includes(value);
}
