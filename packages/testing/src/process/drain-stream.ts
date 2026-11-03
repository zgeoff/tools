export async function drainStream(
  stream: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
): Promise<void> {
  const decoder = new TextDecoder();

  for await (const chunk of stream) {
    onText(decoder.decode(chunk, { stream: true }));
  }
}
