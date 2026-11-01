import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildCommandStub } from '../../test-utils/build-command-stub.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { writeSkillsPinPullRequest } from './write-skills-pin-pull-request.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-write-skills-pin-pull-request-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  await mkdir(join(directory, 'sync'));

  const commands = buildCommandStub();
  const output: string[] = [];

  const writePin = (commit: string) =>
    writeFile(join(directory, 'sync', 'skills-pin.json'), JSON.stringify({ commit }));

  const pin = (commit: string) =>
    writeSkillsPinPullRequest({
      cwd: directory,
      env: {},
      commit,
      repo: 'example/tools',
      fileSystem: nodeFileSystem,
      runCommand: commands.runCommand,
      writeOutput: (text) => {
        output.push(text);
      },
    });

  return { commands, output, writePin, pin };
}

// A refused auto-merge leaves the pull request open for a hand merge, so the run still passes.
test.each([
  ['turns auto-merge on', 0, []],
  [
    'warns and passes when GitHub refuses auto-merge',
    1,
    [
      '::warning::GitHub refused auto-merge; allow auto-merge in the repo settings, or merge the pull request by hand.\n',
    ],
  ],
])('it opens a pull request that moves the pin and %s', async (_label, mergeExitCode, warnings) => {
  const ctx = await setupTest();

  const pinned = '0123456789abcdef0123456789abcdef01234567';
  const commit = '89abcdef0123456789abcdef0123456789abcdef';

  await ctx.writePin(pinned);

  ctx.commands.answer(
    [
      'gh',
      'pr',
      'list',
      '--repo',
      'example/tools',
      '--head',
      'skills-pin',
      '--state',
      'open',
      '--json',
      'number,isCrossRepository',
    ],
    { exitCode: 0, stdout: '[]', stderr: '' },
  );

  ctx.commands.answer(
    ['gh', 'api', `repos/zgeoff/skills/compare/${pinned}...${commit}`, '--jq', '.status'],
    { exitCode: 0, stdout: 'ahead\n', stderr: '' },
  );

  ctx.commands.answer(
    ['gh', 'api', `repos/zgeoff/skills/compare/${commit}...main`, '--jq', '.status'],
    { exitCode: 0, stdout: 'identical\n', stderr: '' },
  );

  ctx.commands.answer(
    ['gh', 'api', 'repos/example/tools/git/ref/heads/main', '--jq', '.object.sha'],
    { exitCode: 0, stdout: 'fedcba9876543210fedcba9876543210fedcba98\n', stderr: '' },
  );

  ctx.commands.answer(['gh', 'api', 'repos/example/tools/git/ref/heads/skills-pin'], {
    exitCode: 1,
    stdout: '',
    stderr: 'gh: Not Found (HTTP 404)',
  });

  ctx.commands.answer(
    [
      'gh',
      'api',
      '--silent',
      'repos/example/tools/git/refs',
      '-f',
      'ref=refs/heads/skills-pin',
      '-f',
      'sha=c0ffee0123456789abcdef0123456789abcdef01',
    ],
    { exitCode: 0, stdout: '', stderr: '' },
  );

  ctx.commands.answer(
    [
      'gh',
      'api',
      'repos/example/tools/contents/sync/skills-pin.json?ref=skills-pin-next',
      '--jq',
      '.sha',
    ],
    { exitCode: 0, stdout: '5d41402abc4b2a76b9719d911017c592ae0f2f0a\n', stderr: '' },
  );

  ctx.commands.answer(
    [
      'gh',
      'api',
      '-X',
      'PUT',
      'repos/example/tools/contents/sync/skills-pin.json',
      '-f',
      'message=chore(skills): pin zgeoff/skills at 89abcdef0123',
      '-f',
      `content=${Buffer.from(`{\n  "commit": "${commit}"\n}\n`).toString('base64')}`,
      '-f',
      'sha=5d41402abc4b2a76b9719d911017c592ae0f2f0a',
      '-f',
      'branch=skills-pin-next',
      '--jq',
      '.commit.sha',
    ],
    { exitCode: 0, stdout: 'c0ffee0123456789abcdef0123456789abcdef01\n', stderr: '' },
  );

  ctx.commands.answer(
    [
      'gh',
      'pr',
      'create',
      '--repo',
      'example/tools',
      '--base',
      'main',
      '--head',
      'skills-pin',
      '--title',
      'chore(skills): pin zgeoff/skills at 89abcdef0123',
      '--body',
      `Moves \`sync/skills-pin.json\` to zgeoff/skills ${commit}, which zgeoff/skills sent from its green main. Once this merges and main is green, the sync dispatch sends the new skill text to every repo that takes it.\n\nChanges: https://github.com/zgeoff/skills/compare/${pinned}...${commit}`,
    ],
    { exitCode: 0, stdout: 'https://github.com/example/tools/pull/41\n', stderr: '' },
  );

  ctx.commands.answer(
    [
      'gh',
      'pr',
      'merge',
      '41',
      '--repo',
      'example/tools',
      '--auto',
      '--squash',
      '--match-head-commit',
      'c0ffee0123456789abcdef0123456789abcdef01',
    ],
    { exitCode: mergeExitCode, stdout: '', stderr: 'auto-merge is not allowed' },
  );

  ctx.commands.answer(['gh', 'api', 'repos/example/tools/git/ref/heads/skills-pin-next'], {
    exitCode: 1,
    stdout: '',
    stderr: 'gh: Not Found (HTTP 404)',
  });

  ctx.commands.answer(
    [
      'gh',
      'api',
      '--silent',
      'repos/example/tools/git/refs',
      '-f',
      'ref=refs/heads/skills-pin-next',
      '-f',
      'sha=fedcba9876543210fedcba9876543210fedcba98',
    ],
    { exitCode: 0, stdout: '', stderr: '' },
  );

  ctx.commands.answer(
    ['gh', 'api', '--silent', '-X', 'DELETE', 'repos/example/tools/git/refs/heads/skills-pin-next'],
    { exitCode: 0, stdout: '', stderr: '' },
  );

  const exitCode = await ctx.pin(commit);

  expect(exitCode).toBe(0);

  expect(ctx.commands.calls).toContainEqual([
    'gh',
    'api',
    '-X',
    'PUT',
    'repos/example/tools/contents/sync/skills-pin.json',
    '-f',
    'message=chore(skills): pin zgeoff/skills at 89abcdef0123',
    '-f',
    `content=${Buffer.from(`{\n  "commit": "${commit}"\n}\n`).toString('base64')}`,
    '-f',
    'sha=5d41402abc4b2a76b9719d911017c592ae0f2f0a',
    '-f',
    'branch=skills-pin-next',
    '--jq',
    '.commit.sha',
  ]);

  expect(ctx.commands.calls.at(-1)).toStrictEqual([
    'gh',
    'pr',
    'merge',
    '41',
    '--repo',
    'example/tools',
    '--auto',
    '--squash',
    '--match-head-commit',
    'c0ffee0123456789abcdef0123456789abcdef01',
  ]);

  expect(ctx.output).toStrictEqual(['https://github.com/example/tools/pull/41\n', ...warnings]);
});

test('it opens its own pull request when only a fork holds a pin branch pull request', async () => {
  const ctx = await setupTest();

  const pinned = '0123456789abcdef0123456789abcdef01234567';
  const commit = '89abcdef0123456789abcdef0123456789abcdef';

  await ctx.writePin(pinned);

  ctx.commands.answer(
    [
      'gh',
      'pr',
      'list',
      '--repo',
      'example/tools',
      '--head',
      'skills-pin',
      '--state',
      'open',
      '--json',
      'number,isCrossRepository',
    ],
    { exitCode: 0, stdout: '[{"number":52,"isCrossRepository":true}]', stderr: '' },
  );

  ctx.commands.answer(
    ['gh', 'api', `repos/zgeoff/skills/compare/${pinned}...${commit}`, '--jq', '.status'],
    { exitCode: 0, stdout: 'ahead\n', stderr: '' },
  );

  ctx.commands.answer(
    ['gh', 'api', `repos/zgeoff/skills/compare/${commit}...main`, '--jq', '.status'],
    { exitCode: 0, stdout: 'identical\n', stderr: '' },
  );

  ctx.commands.answer(
    ['gh', 'api', 'repos/example/tools/git/ref/heads/main', '--jq', '.object.sha'],
    { exitCode: 0, stdout: 'fedcba9876543210fedcba9876543210fedcba98\n', stderr: '' },
  );

  ctx.commands.answer(['gh', 'api', 'repos/example/tools/git/ref/heads/skills-pin'], {
    exitCode: 1,
    stdout: '',
    stderr: 'gh: Not Found (HTTP 404)',
  });

  ctx.commands.answer(
    [
      'gh',
      'api',
      '--silent',
      'repos/example/tools/git/refs',
      '-f',
      'ref=refs/heads/skills-pin',
      '-f',
      'sha=c0ffee0123456789abcdef0123456789abcdef01',
    ],
    { exitCode: 0, stdout: '', stderr: '' },
  );

  ctx.commands.answer(
    [
      'gh',
      'api',
      'repos/example/tools/contents/sync/skills-pin.json?ref=skills-pin-next',
      '--jq',
      '.sha',
    ],
    { exitCode: 0, stdout: '5d41402abc4b2a76b9719d911017c592ae0f2f0a\n', stderr: '' },
  );

  ctx.commands.answer(
    [
      'gh',
      'api',
      '-X',
      'PUT',
      'repos/example/tools/contents/sync/skills-pin.json',
      '-f',
      'message=chore(skills): pin zgeoff/skills at 89abcdef0123',
      '-f',
      `content=${Buffer.from(`{\n  "commit": "${commit}"\n}\n`).toString('base64')}`,
      '-f',
      'sha=5d41402abc4b2a76b9719d911017c592ae0f2f0a',
      '-f',
      'branch=skills-pin-next',
      '--jq',
      '.commit.sha',
    ],
    { exitCode: 0, stdout: 'c0ffee0123456789abcdef0123456789abcdef01\n', stderr: '' },
  );

  ctx.commands.answer(
    [
      'gh',
      'pr',
      'create',
      '--repo',
      'example/tools',
      '--base',
      'main',
      '--head',
      'skills-pin',
      '--title',
      'chore(skills): pin zgeoff/skills at 89abcdef0123',
      '--body',
      `Moves \`sync/skills-pin.json\` to zgeoff/skills ${commit}, which zgeoff/skills sent from its green main. Once this merges and main is green, the sync dispatch sends the new skill text to every repo that takes it.\n\nChanges: https://github.com/zgeoff/skills/compare/${pinned}...${commit}`,
    ],
    { exitCode: 0, stdout: 'https://github.com/example/tools/pull/41\n', stderr: '' },
  );

  ctx.commands.answer(
    [
      'gh',
      'pr',
      'merge',
      '41',
      '--repo',
      'example/tools',
      '--auto',
      '--squash',
      '--match-head-commit',
      'c0ffee0123456789abcdef0123456789abcdef01',
    ],
    { exitCode: 0, stdout: '', stderr: '' },
  );

  ctx.commands.answer(['gh', 'api', 'repos/example/tools/git/ref/heads/skills-pin-next'], {
    exitCode: 1,
    stdout: '',
    stderr: 'gh: Not Found (HTTP 404)',
  });

  ctx.commands.answer(
    [
      'gh',
      'api',
      '--silent',
      'repos/example/tools/git/refs',
      '-f',
      'ref=refs/heads/skills-pin-next',
      '-f',
      'sha=fedcba9876543210fedcba9876543210fedcba98',
    ],
    { exitCode: 0, stdout: '', stderr: '' },
  );

  ctx.commands.answer(
    ['gh', 'api', '--silent', '-X', 'DELETE', 'repos/example/tools/git/refs/heads/skills-pin-next'],
    { exitCode: 0, stdout: '', stderr: '' },
  );

  const exitCode = await ctx.pin(commit);

  expect(exitCode).toBe(0);
  expect(ctx.commands.calls.filter((argv) => argv.includes('52'))).toStrictEqual([]);
});

test('it moves the branch of the open pin pull request to a newer commit', async () => {
  const ctx = await setupTest();

  const pinned = '0123456789abcdef0123456789abcdef01234567';
  const proposed = '456789abcdef0123456789abcdef0123456789ab';
  const commit = '89abcdef0123456789abcdef0123456789abcdef';

  await ctx.writePin(pinned);

  ctx.commands.answer(
    [
      'gh',
      'pr',
      'list',
      '--repo',
      'example/tools',
      '--head',
      'skills-pin',
      '--state',
      'open',
      '--json',
      'number,isCrossRepository',
    ],
    { exitCode: 0, stdout: '[{"number":41,"isCrossRepository":false}]', stderr: '' },
  );

  ctx.commands.answer(
    [
      'gh',
      'api',
      'repos/example/tools/contents/sync/skills-pin.json?ref=skills-pin',
      '-H',
      'Accept: application/vnd.github.raw',
    ],
    { exitCode: 0, stdout: JSON.stringify({ commit: proposed }), stderr: '' },
  );

  ctx.commands.answer(
    ['gh', 'api', `repos/zgeoff/skills/compare/${pinned}...${commit}`, '--jq', '.status'],
    { exitCode: 0, stdout: 'ahead\n', stderr: '' },
  );

  ctx.commands.answer(
    ['gh', 'api', `repos/zgeoff/skills/compare/${proposed}...${commit}`, '--jq', '.status'],
    { exitCode: 0, stdout: 'ahead\n', stderr: '' },
  );

  ctx.commands.answer(
    ['gh', 'api', `repos/zgeoff/skills/compare/${commit}...main`, '--jq', '.status'],
    { exitCode: 0, stdout: 'identical\n', stderr: '' },
  );

  ctx.commands.answer(
    ['gh', 'api', 'repos/example/tools/git/ref/heads/main', '--jq', '.object.sha'],
    { exitCode: 0, stdout: 'fedcba9876543210fedcba9876543210fedcba98\n', stderr: '' },
  );

  ctx.commands.answer(['gh', 'api', 'repos/example/tools/git/ref/heads/skills-pin'], {
    exitCode: 0,
    stdout: '{"object":{"sha":"aaaa"}}',
    stderr: '',
  });

  ctx.commands.answer(
    [
      'gh',
      'api',
      '--silent',
      '-X',
      'PATCH',
      'repos/example/tools/git/refs/heads/skills-pin',
      '-f',
      'sha=c0ffee0123456789abcdef0123456789abcdef01',
      '-F',
      'force=true',
    ],
    { exitCode: 0, stdout: '', stderr: '' },
  );

  ctx.commands.answer(
    [
      'gh',
      'api',
      'repos/example/tools/contents/sync/skills-pin.json?ref=skills-pin-next',
      '--jq',
      '.sha',
    ],
    { exitCode: 0, stdout: '5d41402abc4b2a76b9719d911017c592ae0f2f0a\n', stderr: '' },
  );

  ctx.commands.answer(
    [
      'gh',
      'api',
      '-X',
      'PUT',
      'repos/example/tools/contents/sync/skills-pin.json',
      '-f',
      'message=chore(skills): pin zgeoff/skills at 89abcdef0123',
      '-f',
      `content=${Buffer.from(`{\n  "commit": "${commit}"\n}\n`).toString('base64')}`,
      '-f',
      'sha=5d41402abc4b2a76b9719d911017c592ae0f2f0a',
      '-f',
      'branch=skills-pin-next',
      '--jq',
      '.commit.sha',
    ],
    { exitCode: 0, stdout: 'c0ffee0123456789abcdef0123456789abcdef01\n', stderr: '' },
  );

  ctx.commands.answer(
    [
      'gh',
      'pr',
      'edit',
      '41',
      '--repo',
      'example/tools',
      '--title',
      'chore(skills): pin zgeoff/skills at 89abcdef0123',
      '--body',
      `Moves \`sync/skills-pin.json\` to zgeoff/skills ${commit}, which zgeoff/skills sent from its green main. Once this merges and main is green, the sync dispatch sends the new skill text to every repo that takes it.\n\nChanges: https://github.com/zgeoff/skills/compare/${pinned}...${commit}`,
    ],
    { exitCode: 0, stdout: '', stderr: '' },
  );

  ctx.commands.answer(
    [
      'gh',
      'pr',
      'merge',
      '41',
      '--repo',
      'example/tools',
      '--auto',
      '--squash',
      '--match-head-commit',
      'c0ffee0123456789abcdef0123456789abcdef01',
    ],
    { exitCode: 0, stdout: '', stderr: '' },
  );

  ctx.commands.answer(['gh', 'api', 'repos/example/tools/git/ref/heads/skills-pin-next'], {
    exitCode: 1,
    stdout: '',
    stderr: 'gh: Not Found (HTTP 404)',
  });

  ctx.commands.answer(
    [
      'gh',
      'api',
      '--silent',
      'repos/example/tools/git/refs',
      '-f',
      'ref=refs/heads/skills-pin-next',
      '-f',
      'sha=fedcba9876543210fedcba9876543210fedcba98',
    ],
    { exitCode: 0, stdout: '', stderr: '' },
  );

  ctx.commands.answer(
    ['gh', 'api', '--silent', '-X', 'DELETE', 'repos/example/tools/git/refs/heads/skills-pin-next'],
    { exitCode: 0, stdout: '', stderr: '' },
  );

  const exitCode = await ctx.pin(commit);

  expect(exitCode).toBe(0);

  expect(ctx.commands.calls).toContainEqual([
    'gh',
    'api',
    '-X',
    'PUT',
    'repos/example/tools/contents/sync/skills-pin.json',
    '-f',
    'message=chore(skills): pin zgeoff/skills at 89abcdef0123',
    '-f',
    `content=${Buffer.from(`{\n  "commit": "${commit}"\n}\n`).toString('base64')}`,
    '-f',
    'sha=5d41402abc4b2a76b9719d911017c592ae0f2f0a',
    '-f',
    'branch=skills-pin-next',
    '--jq',
    '.commit.sha',
  ]);

  // The open pull request's branch moves straight to the new commit, never back to main.
  const pinBranchMoves = ctx.commands.calls.filter((argv) =>
    argv.includes('repos/example/tools/git/refs/heads/skills-pin'),
  );

  expect(pinBranchMoves).toStrictEqual([
    [
      'gh',
      'api',
      '--silent',
      '-X',
      'PATCH',
      'repos/example/tools/git/refs/heads/skills-pin',
      '-f',
      'sha=c0ffee0123456789abcdef0123456789abcdef01',
      '-F',
      'force=true',
    ],
  ]);

  expect(ctx.output).toStrictEqual(['Updated pull request #41 for skills-pin.\n']);
});

test('it writes nothing for a commit that the pin on main already covers', async () => {
  const ctx = await setupTest();

  const pinned = '0123456789abcdef0123456789abcdef01234567';
  const commit = '89abcdef0123456789abcdef0123456789abcdef';

  await ctx.writePin(pinned);

  ctx.commands.answer(
    [
      'gh',
      'pr',
      'list',
      '--repo',
      'example/tools',
      '--head',
      'skills-pin',
      '--state',
      'open',
      '--json',
      'number,isCrossRepository',
    ],
    { exitCode: 0, stdout: '[]', stderr: '' },
  );

  ctx.commands.answer(
    ['gh', 'api', `repos/zgeoff/skills/compare/${pinned}...${commit}`, '--jq', '.status'],
    { exitCode: 0, stdout: 'behind\n', stderr: '' },
  );

  ctx.commands.answer(
    ['gh', 'api', `repos/zgeoff/skills/compare/${commit}...main`, '--jq', '.status'],
    { exitCode: 0, stdout: 'ahead\n', stderr: '' },
  );

  const exitCode = await ctx.pin(commit);

  expect(exitCode).toBe(0);
  expect(ctx.commands.calls).toHaveLength(3);

  expect(ctx.output).toStrictEqual([
    `Nothing to pin: main of zgeoff/tools already pins ${commit} or a newer commit.\n`,
  ]);
});

test('it leaves a newer open pin in place for an older dispatch and writes nothing', async () => {
  const ctx = await setupTest();

  const pinned = '0123456789abcdef0123456789abcdef01234567';
  const commit = '456789abcdef0123456789abcdef0123456789ab';
  const proposed = '89abcdef0123456789abcdef0123456789abcdef';

  await ctx.writePin(pinned);

  const listOpen = [
    'gh',
    'pr',
    'list',
    '--repo',
    'example/tools',
    '--head',
    'skills-pin',
    '--state',
    'open',
    '--json',
    'number,isCrossRepository',
  ];

  const readProposed = [
    'gh',
    'api',
    'repos/example/tools/contents/sync/skills-pin.json?ref=skills-pin',
    '-H',
    'Accept: application/vnd.github.raw',
  ];

  const compareToPin = [
    'gh',
    'api',
    `repos/zgeoff/skills/compare/${pinned}...${commit}`,
    '--jq',
    '.status',
  ];

  const compareToProposed = [
    'gh',
    'api',
    `repos/zgeoff/skills/compare/${proposed}...${commit}`,
    '--jq',
    '.status',
  ];

  const compareToMain = [
    'gh',
    'api',
    `repos/zgeoff/skills/compare/${commit}...main`,
    '--jq',
    '.status',
  ];

  ctx.commands.answer(listOpen, {
    exitCode: 0,
    stdout: '[{"number":41,"isCrossRepository":false}]',
    stderr: '',
  });

  ctx.commands.answer(readProposed, {
    exitCode: 0,
    stdout: JSON.stringify({ commit: proposed }),
    stderr: '',
  });

  ctx.commands.answer(compareToPin, { exitCode: 0, stdout: 'ahead\n', stderr: '' });
  ctx.commands.answer(compareToProposed, { exitCode: 0, stdout: 'behind\n', stderr: '' });
  ctx.commands.answer(compareToMain, { exitCode: 0, stdout: 'ahead\n', stderr: '' });

  const exitCode = await ctx.pin(commit);

  expect(exitCode).toBe(0);

  expect(ctx.commands.calls).toStrictEqual([
    listOpen,
    readProposed,
    compareToPin,
    compareToProposed,
    compareToMain,
  ]);

  expect(ctx.output).toStrictEqual([
    `Nothing to pin: the open pin pull request already pins ${commit} or a newer commit.\n`,
  ]);
});

test('it fails and writes nothing for a commit that is not on main of zgeoff/skills', async () => {
  const ctx = await setupTest();

  const pinned = '0123456789abcdef0123456789abcdef01234567';
  const commit = '89abcdef0123456789abcdef0123456789abcdef';

  await ctx.writePin(pinned);

  ctx.commands.answer(
    [
      'gh',
      'pr',
      'list',
      '--repo',
      'example/tools',
      '--head',
      'skills-pin',
      '--state',
      'open',
      '--json',
      'number,isCrossRepository',
    ],
    { exitCode: 0, stdout: '[]', stderr: '' },
  );

  ctx.commands.answer(
    ['gh', 'api', `repos/zgeoff/skills/compare/${pinned}...${commit}`, '--jq', '.status'],
    { exitCode: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' },
  );

  ctx.commands.answer(
    ['gh', 'api', `repos/zgeoff/skills/compare/${commit}...main`, '--jq', '.status'],
    { exitCode: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' },
  );

  const exitCode = await ctx.pin(commit);

  expect(exitCode).toBe(1);
  expect(ctx.commands.calls).toHaveLength(3);

  expect(ctx.output).toStrictEqual([
    `::error::${commit} is not a commit on main of zgeoff/skills\n`,
  ]);
});

test('it fails and calls nothing for a dispatch that names no full commit ID', async () => {
  const ctx = await setupTest();

  await ctx.writePin('0123456789abcdef0123456789abcdef01234567');

  const exitCode = await ctx.pin('main');

  expect(exitCode).toBe(1);
  expect(ctx.commands.calls).toStrictEqual([]);
  expect(ctx.output).toStrictEqual(["::error::'main' is not a full commit ID of zgeoff/skills\n"]);
});

test('it fails and calls nothing when the pin on main holds no full commit ID', async () => {
  const ctx = await setupTest();

  await ctx.writePin('main');

  const exitCode = await ctx.pin('89abcdef0123456789abcdef0123456789abcdef');

  expect(exitCode).toBe(1);
  expect(ctx.commands.calls).toStrictEqual([]);

  expect(ctx.output).toStrictEqual([
    '::error::sync/skills-pin.json holds no full commit ID of zgeoff/skills\n',
  ]);
});

test('it fails and writes nothing when it cannot read the pin of the open pull request', async () => {
  const ctx = await setupTest();

  await ctx.writePin('0123456789abcdef0123456789abcdef01234567');

  ctx.commands.answer(
    [
      'gh',
      'pr',
      'list',
      '--repo',
      'example/tools',
      '--head',
      'skills-pin',
      '--state',
      'open',
      '--json',
      'number,isCrossRepository',
    ],
    { exitCode: 0, stdout: '[{"number":41,"isCrossRepository":false}]', stderr: '' },
  );

  ctx.commands.answer(
    [
      'gh',
      'api',
      'repos/example/tools/contents/sync/skills-pin.json?ref=skills-pin',
      '-H',
      'Accept: application/vnd.github.raw',
    ],
    { exitCode: 1, stdout: '', stderr: 'gh: Server Error (HTTP 502)' },
  );

  const pinning = ctx.pin('89abcdef0123456789abcdef0123456789abcdef');

  expect(pinning).rejects.toThrow('gh: Server Error (HTTP 502)');
  expect(ctx.commands.calls).toHaveLength(2);
});

test('it fails and writes nothing when the open pull request holds no full commit ID', async () => {
  const ctx = await setupTest();

  await ctx.writePin('0123456789abcdef0123456789abcdef01234567');

  ctx.commands.answer(
    [
      'gh',
      'pr',
      'list',
      '--repo',
      'example/tools',
      '--head',
      'skills-pin',
      '--state',
      'open',
      '--json',
      'number,isCrossRepository',
    ],
    { exitCode: 0, stdout: '[{"number":41,"isCrossRepository":false}]', stderr: '' },
  );

  ctx.commands.answer(
    [
      'gh',
      'api',
      'repos/example/tools/contents/sync/skills-pin.json?ref=skills-pin',
      '-H',
      'Accept: application/vnd.github.raw',
    ],
    { exitCode: 0, stdout: JSON.stringify({ commit: 'main' }), stderr: '' },
  );

  const exitCode = await ctx.pin('89abcdef0123456789abcdef0123456789abcdef');

  expect(exitCode).toBe(1);
  expect(ctx.commands.calls).toHaveLength(2);

  expect(ctx.output).toStrictEqual([
    '::error::the open pin pull request #41 holds no full commit ID in sync/skills-pin.json\n',
  ]);
});
