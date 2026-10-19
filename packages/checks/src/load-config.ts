import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord } from '@zgeoff/std';
import { ConfigError } from './config-error.ts';

const CONFIG_FILE = 'zgeoff-check.json';

export interface CheckConfig {
  // The checks the repo turns off, each with the reason it gives.
  readonly off: ReadonlyMap<string, string>;
}

// Reads zgeoff-check.json from the repo root. A repo without the file runs every check.
export function loadConfig(cwd: string, checkNames: readonly string[]): CheckConfig {
  let text: string;

  try {
    text = readFileSync(join(cwd, CONFIG_FILE), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { off: new Map() };
    }

    throw error;
  }

  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`${CONFIG_FILE}: ${error instanceof Error ? error.message : 'not JSON'}`);
  }

  return parseConfig(value, checkNames);
}

function parseConfig(value: unknown, checkNames: readonly string[]): CheckConfig {
  if (!isRecord(value)) {
    throw new ConfigError(`${CONFIG_FILE}: the file must hold an object`);
  }

  const unknownKeys = Object.keys(value).filter((key) => key !== 'off');

  if (unknownKeys.length > 0) {
    throw new ConfigError(`${CONFIG_FILE}: unknown key ${unknownKeys.join(', ')}`);
  }

  const entries = value['off'] ?? [];

  if (!Array.isArray(entries)) {
    throw new ConfigError(`${CONFIG_FILE}: off must be a list of { "check", "reason" } entries`);
  }

  const off = new Map<string, string>();

  for (const [index, entry] of entries.entries()) {
    const at = `${CONFIG_FILE}: off[${index}]`;

    if (!isRecord(entry)) {
      throw new ConfigError(`${at} must be an object with a check and a reason`);
    }

    const check = entry['check'];
    const reason = entry['reason'];
    const extraKeys = Object.keys(entry).filter((key) => key !== 'check' && key !== 'reason');

    if (extraKeys.length > 0) {
      throw new ConfigError(`${at} has an unknown key ${extraKeys.join(', ')}`);
    }

    if (typeof check !== 'string' || !checkNames.includes(check)) {
      throw new ConfigError(`${at} names no known check; the checks are ${checkNames.join(', ')}`);
    }

    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new ConfigError(`${at} turns off ${check} with no reason; give one in reason`);
    }

    if (off.has(check)) {
      throw new ConfigError(`${at} turns off ${check} a second time`);
    }

    off.set(check, reason);
  }

  return { off };
}
