// The writeOutput a command's entry point hands its options: each text goes to stdout as it is.
export function writeStdout(text: string): void {
  process.stdout.write(text);
}
