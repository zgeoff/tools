const evalFilePattern = /(?:^|\/)evals\/(?<name>[^/]+)\/run-\k<name>-eval\.ts$/u;

export function collectEvalFiles(trackedFiles: readonly string[]): readonly string[] {
  return trackedFiles.filter((file) => evalFilePattern.test(file));
}
