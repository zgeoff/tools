import { readBodyText } from './read-body-text.ts';

export const MAX_FORM_BYTES = 16 * 1024;

// The fields of a form post, or an empty form for any other body.
export async function readForm(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get('content-type') ?? '';

  if (!type.startsWith('application/x-www-form-urlencoded')) {
    return new URLSearchParams();
  }

  const text = await readBodyText(request, MAX_FORM_BYTES);

  return new URLSearchParams(text ?? '');
}
