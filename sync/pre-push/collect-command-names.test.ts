import { expect, test } from 'bun:test';
import { collectCommandNames } from './collect-command-names.ts';
import { parseShellWords } from './parse-shell-words.ts';

test.each([
  ['scripts/ci/check-kvm.sh', ['scripts/ci/check-kvm.sh']],
  ['echo scripts/ci/check-kvm.sh', ['echo']],
  ['QEMU=1 scripts/open-kvm.sh --strict', ['scripts/open-kvm.sh']],
  ['QEMU="1" bash scripts/open-kvm.sh', ['bash', 'scripts/open-kvm.sh']],
  ['FORCE=1', []],
  ['echo one; scripts/open-kvm.sh', ['echo', 'scripts/open-kvm.sh']],
  ['echo $(( 1 + 2 ))', ['echo']],
  ['bash', ['bash']],
  ['bash scripts/open-kvm.sh', ['bash', 'scripts/open-kvm.sh']],
  ['sh -e scripts/open-kvm.sh', ['sh', 'scripts/open-kvm.sh']],
  ['bash -eu -o pipefail scripts/open-kvm.sh', ['bash', 'scripts/open-kvm.sh']],
  ['bash +o posix scripts/open-kvm.sh', ['bash', 'scripts/open-kvm.sh']],
  ['bash --norc --noprofile scripts/open-kvm.sh', ['bash', 'scripts/open-kvm.sh']],
  ['bash -- scripts/open-kvm.sh', ['bash', 'scripts/open-kvm.sh']],
  ['bash -s scripts/open-kvm.sh', ['bash']],
  [`sh -ec 'scripts/ci/check-kvm.sh --strict'`, ['sh', 'scripts/ci/check-kvm.sh']],
  [`bash -c 'bun run ci:open-kvm'`, ['bash', 'bun', 'ci:open-kvm']],
  ['bun run ci:open-kvm', ['bun', 'ci:open-kvm']],
  ['bun run --silent ci:open-kvm --strict', ['bun', 'ci:open-kvm']],
  ['bun run --cwd ci:open-kvm lint', ['bun', 'lint']],
  ['bun run --cwd packages/vm ci:open-kvm', ['bun', 'ci:open-kvm']],
  ['bun run --cwd=packages/vm ci:open-kvm', ['bun', 'ci:open-kvm']],
  ['bun --cwd packages/vm run ci:open-kvm', ['bun', 'ci:open-kvm']],
  ['bun run -F vm --if-present ci:open-kvm', ['bun', 'ci:open-kvm']],
  ['bun run --filter=vm ci:open-kvm', ['bun', 'ci:open-kvm']],
  ['bun run --env-file .env.ci --shell bun ci:open-kvm', ['bun', 'ci:open-kvm']],
  ['bun run --inspect=127.0.0.1:9229 ci:open-kvm', ['bun', 'ci:open-kvm']],
  ['bun ci:open-kvm', ['bun', 'ci:open-kvm']],
  ['bun scripts/check-kvm.ts', ['bun', 'scripts/check-kvm.ts']],
  ['bun install --frozen-lockfile', ['bun']],
  ['bun test --timeout 5000', ['bun']],
  ['bun run', ['bun']],
])('it reads %p as running %p', (command, names) => {
  expect(collectCommandNames(parseShellWords(command))).toStrictEqual(names);
});

test.each([
  ['echo "$(scripts/ci/check-kvm.sh)"'],
  ['echo `scripts/ci/check-kvm.sh`'],
  ['"$TOOL" scripts/open-kvm.sh'],
  ['bash --rcfile .bashrc scripts/open-kvm.sh'],
  ['bash -c'],
  [`bun -e 'console.log(1)'`],
  ['bun run --unknown-flag ci:open-kvm'],
  ['bun --frozen-lockfile install'],
])('it skips %p, a form it does not read', (command) => {
  expect(collectCommandNames(parseShellWords(command))).toBeUndefined();
});
