// The parser throws one error that holds every reason the command line is refused, so each reason
// prints on a line of its own.
export function formatParseError(error: unknown): string {
  if (error instanceof AggregateError) {
    return error.errors.map((reason) => formatParseError(reason)).join('\n');
  }

  return error instanceof Error ? error.message : String(error);
}
