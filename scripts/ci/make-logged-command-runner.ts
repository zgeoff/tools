import type { CommandOptions, CommandResult, RunCommand } from './run-command.ts';

export interface OutputSink {
  readonly write: (chunk: Uint8Array) => unknown;
}

export interface LoggedOutput {
  readonly stdout: OutputSink;

  readonly stderr: OutputSink;
}

// The runner runs a command like runCommand, and also copies its output to the sinks as it
// arrives, so a step's log shows a slow or hung command's output before the command ends.
export function makeLoggedCommandRunner(output: Readonly<LoggedOutput>): RunCommand {
  return async (argv: readonly string[], options: Readonly<CommandOptions>) => {
    const child = Bun.spawn([...argv], {
      cwd: options.cwd,
      env: { ...options.env },
      stdin: options.stdin === undefined ? 'ignore' : Buffer.from(options.stdin),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      readTeedStream(child.stdout, output.stdout),
      readTeedStream(child.stderr, output.stderr),
      child.exited,
    ]);

    const result: CommandResult = { exitCode, stdout, stderr };

    return result;
  };
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
