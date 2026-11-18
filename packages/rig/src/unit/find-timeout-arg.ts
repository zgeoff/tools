export function findTimeoutArg(args: readonly string[]): string | undefined {
  return args.find((arg) => arg === '--timeout' || arg.startsWith('--timeout='));
}
