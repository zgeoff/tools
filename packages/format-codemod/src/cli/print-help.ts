export function printHelp(): void {
  process.stdout.write(`format-codemod — enforce blank-line padding conventions via text splice

usage:
  format-codemod [options] <file|dir|glob> ...

options:
  --check            exit 1 if any file would change (no writes)
  --dry              print unified diff to stdout (no writes)
  --bench            print parse stats as JSON to stderr
  --quiet            only print files that would change
  --ignore <glob>    skip files matching the glob (repeatable)
  --version
  --help

files:
  .formatignore      read from the working directory when present: one glob per
                     line, blank lines and # comments skipped, merged with
                     --ignore

exit codes:
  0  clean
  1  files would change (--check)
  2  usage error, or one or more files failed (parse error, unreadable, unwritable)

examples:
  format-codemod 'src/**/*.ts'
  format-codemod --check 'src/**/*.{ts,tsx}'
  format-codemod --dry path/to/file.ts
  format-codemod --ignore 'src/generated/**' .
`);
}
