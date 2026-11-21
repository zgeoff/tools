export async function readStreamUntil(
  stream: ReadableStream<Uint8Array>,
  text: string,
): Promise<string> {
  const decoder = new TextDecoder();

  let output = '';

  for await (const chunk of stream.values({ preventCancel: true })) {
    output += decoder.decode(chunk, { stream: true });

    if (output.includes(text)) {
      return output;
    }
  }

  return output;
}
