import { isRecord } from '@zgeoff/std';

// The `error` field of a JSON answer, or null when the body is not one.
export async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.clone().json();

    return isRecord(body) && typeof body['error'] === 'string' ? body['error'] : null;
  } catch {
    return null;
  }
}
