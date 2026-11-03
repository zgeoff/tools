export function findIsolateArg(args: readonly string[]): string | undefined {
  return args.find((arg) => arg === '--isolate' || arg.startsWith('--isolate='));
}
