export function findIsolateArgument(args: readonly string[]): string | undefined {
  return args.find((argument) => argument === '--isolate' || argument.startsWith('--isolate='));
}
