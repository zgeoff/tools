// A browser's form post to the server's own page.
export function buildFormRequest(
  url: string,
  fields: URLSearchParams,
  headers: Readonly<Record<string, string>> = {},
): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: fields,
  });
}
