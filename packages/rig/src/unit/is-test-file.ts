const testFilePattern = /[._](?:test|spec)\.[jt]sx?$/u;

export function isTestFile(path: string): boolean {
  return testFilePattern.test(path);
}
