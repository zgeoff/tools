export function printHelp(): void {
  process.stdout.write(`format-codemod — enforce blank-line padding conventions via text splice

usage:
  format-codemod [options] <file|dir|glob> ...

options:
  --check     exit 1 if any file would change (no writes)
  --dry       print unified diff to stdout (no writes)
  --bench     print parse stats as JSON to stderr
  --quiet     only print files that would change
  --version
  --help

exit codes:
  0  clean
  1  files would change (--check)
  2  usage error, or one or more files failed (parse error, unreadable, unwritable)

examples:
  format-codemod 'src/**/*.ts'
  format-codemod --check 'src/**/*.{ts,tsx}'
  format-codemod --dry path/to/file.ts
`);
}
