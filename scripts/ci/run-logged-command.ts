import type { CommandOptions, CommandResult } from './run-command.ts';

// Runs the command like runCommand, and also copies its output to this process's own as it
// arrives, so a step's log shows a slow or hung command's output before the command ends.
export async function runLoggedCommand(
  argv: readonly string[],
  options: Readonly<CommandOptions>,
): Promise<CommandResult> {
  const child = Bun.spawn([...argv], {
    cwd: options.cwd,
    env: { ...options.env },
    stdin: options.stdin === undefined ? 'ignore' : Buffer.from(options.stdin),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    readTeedStream(child.stdout, process.stdout),
    readTeedStream(child.stderr, process.stderr),
    child.exited,
  ]);

  return { exitCode, stdout, stderr };
}

interface OutputSink {
  readonly write: (chunk: Uint8Array) => unknown;
}

async function readTeedStream(
  stream: ReadableStream<Uint8Array>,
  sink: OutputSink,
): Promise<string> {
  const decoder = new TextDecoder();

  let text = '';

  for await (const chunk of stream) {
    sink.write(chunk);

    text += decoder.decode(chunk, { stream: true });
  }

  return text + decoder.decode();
}
