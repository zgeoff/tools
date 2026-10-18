import { expect, test } from 'bun:test';
import { collectWrittenPaths } from './collect-written-paths.ts';

test.each([
  ["sed -i 's/oldName/newName/' src/a.ts src/b.ts", [{ path: 'src/a.ts' }, { path: 'src/b.ts' }]],
  ["sed -ni.bak '/draft/p' src/a.ts", [{ path: 'src/a.ts' }]],
  ["sed --in-place -e 's/a/b/' -e 's/c/d/' src/a.ts", [{ path: 'src/a.ts' }]],
  ["sed -E -i 's/a/b/' -- -odd.ts", [{ path: '-odd.ts' }]],
  ["perl -pi -e 's/oldName/newName/' src/a.ts", [{ path: 'src/a.ts' }]],
  ["echo 'x' > src/a.ts", [{ path: 'src/a.ts' }]],
  ["echo 'x' >> src/a.ts", [{ path: 'src/a.ts' }]],
  ['echo x>src/a.ts', [{ path: 'src/a.ts' }]],
  ['bun test 2> err.log', [{ path: 'err.log' }]],
  ['bun test &> run.log', [{ path: 'run.log' }]],
  ['bun test >& run.log', [{ path: 'run.log' }]],
  ["printf 'x' | tee -a src/a.ts src/b.ts", [{ path: 'src/a.ts' }, { path: 'src/b.ts' }]],
  ['cp -r drafts/a.ts src/a.ts', [{ path: 'src/a.ts', fileName: 'a.ts' }]],
  ['mv drafts/a.ts drafts/b.ts src/', [{ path: 'src/a.ts' }, { path: 'src/b.ts' }]],
  ['cp -t src drafts/a.ts', [{ path: 'src/a.ts' }]],
  ["cd src && sed -i 's/a/b/' a.ts", [{ path: 'src/a.ts' }]],
  ['cd src; cd ../docs; echo x > a.md', [{ path: 'docs/a.md' }]],
  ["sudo -u builder env CI=1 sed -i 's/a/b/' src/a.ts", [{ path: 'src/a.ts' }]],
  ['NAME=value tee src/a.ts < input.txt', [{ path: 'src/a.ts' }]],
  ['bash -c "sed -i \'s/a/b/\' src/a.ts"', [{ path: 'src/a.ts' }]],
  [
    "cat > src/a.ts <<'EOF'\nexport const a = 1;\nEOF\necho done > done.txt",
    [{ path: 'src/a.ts' }, { path: 'done.txt' }],
  ],
  [`python3 -c "open('src/a.ts', 'w').write('x')"`, [{ path: 'src/a.ts' }]],
  [
    "python3 - <<'EOF'\nfrom pathlib import Path\nPath('src/a.ts').write_text('x')\nEOF",
    [{ path: 'src/a.ts' }],
  ],
  [`node -e "require('fs').writeFileSync('src/a.ts', 'x')"`, [{ path: 'src/a.ts' }]],
  [`bun -e "await Bun.write('src/a.ts', 'x')"`, [{ path: 'src/a.ts' }]],
  [`ruby -e "File.write('src/a.ts', 'x')"`, [{ path: 'src/a.ts' }]],
  [`python3 -c "n = 7 // 2; open('src/a.ts', 'w').write(str(n))"`, [{ path: 'src/a.ts' }]],
  [
    `node -e "class Draft { #body = 'x'; }; require('fs').writeFileSync('src/a.ts', 'x')"`,
    [{ path: 'src/a.ts' }],
  ],
  ["/usr/bin/sed -i 's/a/b/' /srv/app/a.ts", [{ path: '/srv/app/a.ts' }]],
  ['(cd /srv); echo x > src/a.ts', [{ path: 'src/a.ts' }]],
  ['cd /srv | cat; echo x > src/a.ts', [{ path: 'src/a.ts' }]],
  ['cd /srv & echo x > src/a.ts', [{ path: 'src/a.ts' }]],
  ['cd docs && cd .. & echo x > README.md', [{ path: 'README.md' }]],
  ['(cd docs; cd /srv) & echo x > README.md', [{ path: 'README.md' }]],
  [`node -e "/* a note */ require('fs').writeFileSync('src/a.ts', 'x')"`, [{ path: 'src/a.ts' }]],
  ["sudo -n sed -i 's/a/b/' src/a.ts", [{ path: 'src/a.ts' }]],
  ["python3 - <<'EOF' | cat\nopen('src/a.ts', 'w').write('x')\nEOF", [{ path: 'src/a.ts' }]],
  ['(cd docs; (cd ..); echo x > a.md); echo x > b.md', [{ path: 'docs/a.md' }, { path: 'b.md' }]],
])('it finds the paths that %j writes', (command, expected) => {
  expect(collectWrittenPaths(command)).toStrictEqual(expected);
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
  [`python3 - <<'EOF'\nprint("open('src/a.ts', 'w')")\nEOF`],
  [`node -e "// writeFileSync('src/a.ts', 'x')"`],
  [`node -e "/* writeFileSync('src/a.ts', 'x') */ console.log('ok')"`],
])('it finds no written path in %j', (command) => {
  expect(collectWrittenPaths(command)).toStrictEqual([]);
});

test('it keeps an absolute path after a cd it cannot follow', () => {
  expect(collectWrittenPaths('cd "$DIR" && echo x > /srv/app/a.ts')).toStrictEqual([
    { path: '/srv/app/a.ts' },
  ]);
});
