export interface BasicCredentials {
  readonly clientID: string;
  readonly secret: string;
}

const BASIC_PATTERN = /^basic +(?<encoded>[A-Za-z0-9+/]+={0,2})$/iu;

// RFC 6749 section 2.3.1 form-encodes both parts, and the MCP SDK's client
// sends the ID raw, so both parse. The split is at the last colon, because the
// secret holds none.
export function parseBasicCredentials(header: string | null): BasicCredentials | null {
  const encoded = header === null ? undefined : BASIC_PATTERN.exec(header)?.groups?.['encoded'];

  if (encoded === undefined) {
    return null;
  }

  let decoded: string;

  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(encoded, 'base64'));
  } catch {
    return null;
  }

  const colon = decoded.lastIndexOf(':');

  if (colon === -1) {
    return null;
  }

  const clientID = decodeFormValue(decoded.slice(0, colon));
  const secret = decodeFormValue(decoded.slice(colon + 1));

  if (clientID === null || secret === null || clientID === '' || secret === '') {
    return null;
  }

  return { clientID, secret };
}

function decodeFormValue(value: string): string | null {
  try {
    return decodeURIComponent(value.replaceAll('+', ' '));
  } catch {
    return null;
  }
}
