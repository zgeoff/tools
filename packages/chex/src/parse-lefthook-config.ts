import { isRecord } from '@zgeoff/std';

export function parseLefthookConfig(text: string): Record<string, unknown> | undefined {
  let parsed: unknown;

  try {
    parsed = Bun.YAML.parse(text);
  } catch {
    return undefined;
  }

  if (parsed === null) {
    return {};
  }

  return isRecord(parsed) ? parsed : undefined;
}
