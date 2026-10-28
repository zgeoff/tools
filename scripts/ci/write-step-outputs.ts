import { appendFile } from 'node:fs/promises';

// GitHub Actions reads each `name=value` line of the file that GITHUB_OUTPUT names as one step
// output, so a value that holds a newline would end its output early.
export async function writeStepOutputs(
  outputPath: string,
  outputs: Readonly<Record<string, string>>,
): Promise<void> {
  const lines = Object.entries(outputs).map(([name, value]) => {
    if (value.includes('\n')) {
      throw new Error(`the step output ${name} holds a newline`);
    }

    return `${name}=${value}\n`;
  });

  await appendFile(outputPath, lines.join(''));
}
