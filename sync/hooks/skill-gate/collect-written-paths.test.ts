import { expect, test } from 'bun:test';
import { collectWrittenPaths } from './collect-written-paths.ts';

test.each([
  ["sed -i 's/oldName/newName/' src/a.ts src/b.ts", ['src/a.ts', 'src/b.ts']],
  ["sed -ni.bak '/draft/p' src/a.ts", ['src/a.ts']],
  ["sed --in-place -e 's/a/b/' -e 's/c/d/' src/a.ts", ['src/a.ts']],
  ["sed -E -i 's/a/b/' -- -odd.ts", ['-odd.ts']],
  ["perl -pi -e 's/oldName/newName/' src/a.ts", ['src/a.ts']],
  ["echo 'x' > src/a.ts", ['src/a.ts']],
  ["echo 'x' >> src/a.ts", ['src/a.ts']],
  ['echo x>src/a.ts', ['src/a.ts']],
  ['bun test 2> err.log', ['err.log']],
  ['bun test &> run.log', ['run.log']],
  ['bun test >& run.log', ['run.log']],
  ["printf 'x' | tee -a src/a.ts src/b.ts", ['src/a.ts', 'src/b.ts']],
  ['cp -r drafts/a.ts src/a.ts', [{ path: 'src/a.ts', fileName: 'a.ts' }]],
  ['mv drafts/a.ts drafts/b.ts src/', ['src/a.ts', 'src/b.ts']],
  ['cp -t src drafts/a.ts', ['src/a.ts']],
  ["cd src && sed -i 's/a/b/' a.ts", ['src/a.ts']],
  ['cd src; cd ../docs; echo x > a.md', ['docs/a.md']],
  ["sudo -u builder env CI=1 sed -i 's/a/b/' src/a.ts", ['src/a.ts']],
  ['NAME=value tee src/a.ts < input.txt', ['src/a.ts']],
  ['bash -c "sed -i \'s/a/b/\' src/a.ts"', ['src/a.ts']],
  [
    "cat > src/a.ts <<'EOF'\nexport const a = 1;\nEOF\necho done > done.txt",
    ['src/a.ts', 'done.txt'],
  ],
  [`python3 -c "open('src/a.ts', 'w').write('x')"`, ['src/a.ts']],
  [
    "python3 - <<'EOF'\nfrom pathlib import Path\nPath('src/a.ts').write_text('x')\nEOF",
    ['src/a.ts'],
  ],
  [`node -e "require('fs').writeFileSync('src/a.ts', 'x')"`, ['src/a.ts']],
  [`bun -e "await Bun.write('src/a.ts', 'x')"`, ['src/a.ts']],
  [`ruby -e "File.write('src/a.ts', 'x')"`, ['src/a.ts']],
  ["/usr/bin/sed -i 's/a/b/' /srv/app/a.ts", ['/srv/app/a.ts']],
])('it finds the paths that %j writes', (command, expected) => {
  expect(collectWrittenPaths(command)).toStrictEqual(
    expected.map((entry) => (typeof entry === 'string' ? { path: entry } : entry)),
  );
});

test.each([
  ["sed -n '1,20p' src/a.ts"],
  ["sed 's/a/b/' src/a.ts"],
  ['cat src/a.ts'],
  ['grep -rn oldName src'],
  ['bun test 2>&1'],
  ['wc -l < src/a.ts 2>&1'],
  [`python3 -c "print(open('src/a.ts').read())"`],
  ['echo x > "$TARGET"'],
  ['echo x > $(git rev-parse --show-toplevel)/a.ts'],
  ["sed -i 's/a/b/' src/*.ts"],
  ['cd "$DIR" && sed -i \'s/a/b/\' a.ts'],
  ["echo 'unclosed > src/a.ts"],
  ['# echo x > src/a.ts'],
])('it finds no written path in %j', (command) => {
  expect(collectWrittenPaths(command)).toStrictEqual([]);
});

test('it keeps an absolute path after a cd it cannot follow', () => {
  expect(collectWrittenPaths('cd "$DIR" && echo x > /srv/app/a.ts')).toStrictEqual([
    { path: '/srv/app/a.ts' },
  ]);
});
