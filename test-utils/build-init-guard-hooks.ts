// The pre-commit and pre-push hooks that `chex init` adds to a lefthook.yml that has neither, each
// running only the chex-baseline job.
export function buildInitGuardHooks(): string {
  return (
    '\npre-commit:\n  jobs:\n' +
    '    - name: chex-baseline\n' +
    '      run: |\n' +
    '        if [ ! -f node_modules/@zgeoff/chex/lefthook.yml ]; then\n' +
    '          echo "chex-baseline: node_modules/@zgeoff/chex/lefthook.yml is missing, so lefthook runs none of the chex baseline\'s jobs; run bun install, then try again"\n' +
    '          exit 1\n' +
    '        fi\n' +
    '\npre-push:\n  jobs:\n' +
    '    - name: chex-baseline\n' +
    '      run: |\n' +
    '        if [ ! -f node_modules/@zgeoff/chex/lefthook.yml ]; then\n' +
    '          echo "chex-baseline: node_modules/@zgeoff/chex/lefthook.yml is missing, so lefthook runs none of the chex baseline\'s jobs; run bun install, then try again"\n' +
    '          exit 1\n' +
    '        fi\n'
  );
}
