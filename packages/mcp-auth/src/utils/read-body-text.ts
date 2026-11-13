// The body as text, or null when it is absent or longer than the limit.
export async function readBodyText(request: Request, maxBytes: number): Promise<string | null> {
  if (request.body === null) {
    return null;
  }

  const body: ReadableStream<Uint8Array> = request.body;
  const chunks: Uint8Array[] = [];
  let total = 0;

  // Leaving the loop early cancels the rest of the body.
  for await (const chunk of body) {
    total += chunk.byteLength;

    if (total > maxBytes) {
      return null;
    }

    chunks.push(chunk);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}
