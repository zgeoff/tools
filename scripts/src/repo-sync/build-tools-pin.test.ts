import { expect, test } from 'bun:test';
import { buildToolsPin } from './build-tools-pin.ts';

test.each([
  [
    'a numbered tag',
    '    uses: zgeoff/tools/.github/workflows/repo-sync.yml@v12',
    `    uses: zgeoff/tools/.github/workflows/repo-sync.yml@3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e # main`,
  ],
  [
    'the main placeholder of a delivered caller',
    '    uses: zgeoff/tools/.github/workflows/bun-checks.yml@main',
    `    uses: zgeoff/tools/.github/workflows/bun-checks.yml@3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e # main`,
  ],
  [
    'an older commit pin',
    '    uses: zgeoff/tools/.github/workflows/repo-sync.yml@0123456789abcdef0123456789abcdef01234567 # main',
    `    uses: zgeoff/tools/.github/workflows/repo-sync.yml@3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e # main`,
  ],
  [
    'a quoted call',
    "    uses: 'zgeoff/tools/.github/workflows/audit-fix.yml@v3'",
    `    uses: 'zgeoff/tools/.github/workflows/audit-fix.yml@3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e' # main`,
  ],
])('it pins %s to the commit with a main comment', (_label, line, expected) => {
  const pinned = buildToolsPin(
    `jobs:\n  sync:\n${line}\n`,
    '3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e',
  );

  expect(pinned).toBe(`jobs:\n  sync:\n${expected}\n`);
});

test('it pins a call in a flow mapping without a comment that would swallow the bracket', () => {
  const pinned = buildToolsPin(
    'jobs:\n  gate: {uses: zgeoff/tools/.github/workflows/paths-changed.yml@v1}\n',
    '3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e',
  );

  expect(pinned).toBe(
    `jobs:\n  gate: {uses: zgeoff/tools/.github/workflows/paths-changed.yml@3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e}\n`,
  );
});

test('it leaves a call to another owner and every other line alone', () => {
  const text =
    '# Calls zgeoff/tools at a commit.\njobs:\n  a:\n    uses: other-zgeoff/tools/.github/workflows/x.yml@v1\n  b:\n    uses: actions/checkout@v4\n';

  const pinned = buildToolsPin(text, '3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e');

  expect(pinned).toBe(text);
});

test('it pins every call on a line that holds several', () => {
  const pinned = buildToolsPin(
    "jobs: {a: {uses: zgeoff/tools/.github/workflows/a.yml@v1}, b: {uses: 'zgeoff/tools/.github/workflows/b.yml@main'}}\n",
    '3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e',
  );

  expect(pinned).toBe(
    "jobs: {a: {uses: zgeoff/tools/.github/workflows/a.yml@3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e}, b: {uses: 'zgeoff/tools/.github/workflows/b.yml@3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e'}}\n",
  );
});
