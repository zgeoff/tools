// A call with Bun's unix option, or to a passthrough host, goes to Bun's own fetch. msw drops the
// unix and tls options of a request that it passes through, so it can't carry such a call.
export function isNativeFetchCall(
  input: string | URL | Request,
  init: BunFetchRequestInit | undefined,
  passthroughHosts: readonly string[],
): boolean {
  if (typeof init?.unix === 'string') {
    return true;
  }

  const href = input instanceof Request ? input.url : input.toString();
  const url = URL.parse(href);

  return url !== null && passthroughHosts.includes(url.hostname);
}
