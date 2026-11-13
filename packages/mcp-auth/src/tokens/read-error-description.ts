import { isRecord } from '@zgeoff/std';

export function readErrorDescription(answer: unknown): string | null {
  if (!isRecord(answer)) {
    return null;
  }

  const description = answer['error_description'];

  return typeof description === 'string' ? description : null;
}
