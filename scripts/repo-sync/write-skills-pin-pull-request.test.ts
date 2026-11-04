import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRunFolderPrefix, writeTreeFiles } from '@zgeoff/testing/helpers';
import { $ } from 'bun';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { buildCommandStub } from '../test-utils/build-command-stub.ts';
import { writeSkillsPinPullRequest } from './write-skills-pin-pull-request.ts';

async function setupTest() {
  const directory = await mkdtemp(
    join(import.meta.dir, readRunFolderPrefix('.test-write-skills-pin-pull-request-')),
  );

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

  const checkScriptPath = fileURLToPath(new URL('../check-sync-manifest.sh', import.meta.url));

  return { directory, checkScriptPath, commands, output, writePin, pin };
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

  ctx.commands.answer(['git', 'rev-parse', 'HEAD'], {
    exitCode: 0,
    stdout: 'fedcba9876543210fedcba9876543210fedcba98\n',
    stderr: '',
  });

  ctx.commands.answer(['gh', 'api', `repos/zgeoff/skills/git/trees/${commit}?recursive=1`], {
    exitCode: 0,
    stdout: JSON.stringify({
      truncated: false,
      tree: [{ path: 'skills/kettle/SKILL.md', mode: '100644', type: 'blob' }],
    }),
    stderr: '',
  });

  ctx.commands.answer(
    [
      'gh',
      'api',
      'repos/example/tools/contents/sync/manifest.json?ref=fedcba9876543210fedcba9876543210fedcba98',
    ],
    {
      exitCode: 0,
      stdout: JSON.stringify({
        sha: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33',
        content: Buffer.from('[]\n').toString('base64'),
        encoding: 'base64',
      }),
      stderr: '',
    },
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

test('it adds a new file of a skill folder the manifest ships, and the manifest passes the sync check', async () => {
  const ctx = await setupTest();

  const pinned = '0123456789abcdef0123456789abcdef01234567';
  const commit = '89abcdef0123456789abcdef0123456789abcdef';

  const manifest = [
    {
      name: 'skill-kettle',
      description: 'The kettle skill',
      files: [
        {
          repo: 'zgeoff/skills',
          source: 'skills/kettle/SKILL.md',
          target: '.claude/skills/kettle/SKILL.md',
        },
        {
          repo: 'zgeoff/skills',
          source: 'skills/kettle/references/limescale.md',
          target: '.claude/skills/kettle/references/limescale.md',
        },
      ],
    },
  ];

  const manifestText = JSON.stringify(manifest);

  const expectedManifest = `[
  {
    "name": "skill-kettle",
    "description": "The kettle skill",
    "files": [
      {
        "repo": "zgeoff/skills",
        "source": "skills/kettle/SKILL.md",
        "target": ".claude/skills/kettle/SKILL.md"
      },
      {
        "repo": "zgeoff/skills",
        "source": "skills/kettle/references/descaling.md",
        "target": ".claude/skills/kettle/references/descaling.md"
      },
      {
        "repo": "zgeoff/skills",
        "source": "skills/kettle/references/limescale.md",
        "target": ".claude/skills/kettle/references/limescale.md"
      },
      {
        "repo": "zgeoff/skills",
        "source": "skills/kettle/scripts/boil.sh",
        "target": ".claude/skills/kettle/scripts/boil.sh",
        "mode": "0755"
      }
    ]
  }
]
`;

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

  ctx.commands.answer(['git', 'rev-parse', 'HEAD'], {
    exitCode: 0,
    stdout: 'fedcba9876543210fedcba9876543210fedcba98\n',
    stderr: '',
  });

  ctx.commands.answer(['gh', 'api', `repos/zgeoff/skills/git/trees/${commit}?recursive=1`], {
    exitCode: 0,
    stdout: JSON.stringify({
      truncated: false,
      tree: [
        { path: 'skills/kettle/SKILL.md', mode: '100644', type: 'blob' },
        { path: 'skills/kettle/references/descaling.md', mode: '100644', type: 'blob' },
        { path: 'skills/kettle/references/limescale.md', mode: '100644', type: 'blob' },
        { path: 'skills/kettle/scripts/boil.sh', mode: '100755', type: 'blob' },
      ],
    }),
    stderr: '',
  });

  ctx.commands.answer(
    [
      'gh',
      'api',
      'repos/example/tools/contents/sync/manifest.json?ref=fedcba9876543210fedcba9876543210fedcba98',
    ],
    {
      exitCode: 0,
      stdout: JSON.stringify({
        sha: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33',
        content: Buffer.from(manifestText).toString('base64'),
        encoding: 'base64',
      }),
      stderr: '',
    },
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

  const writeManifest = [
    'gh',
    'api',
    '-X',
    'PUT',
    'repos/example/tools/contents/sync/manifest.json',
    '-f',
    'message=chore(skills): list the new skill files in the sync manifest',
    '-f',
    `content=${Buffer.from(expectedManifest).toString('base64')}`,
    '-f',
    'sha=0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33',
    '-f',
    'branch=skills-pin-next',
    '--jq',
    '.commit.sha',
  ];

  ctx.commands.answer(writeManifest, {
    exitCode: 0,
    stdout: 'beefcafe0123456789abcdef0123456789abcdef\n',
    stderr: '',
  });

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
      'sha=beefcafe0123456789abcdef0123456789abcdef',
    ],
    { exitCode: 0, stdout: '', stderr: '' },
  );

  ctx.commands.answer(
    ['gh', 'api', '--silent', '-X', 'DELETE', 'repos/example/tools/git/refs/heads/skills-pin-next'],
    { exitCode: 0, stdout: '', stderr: '' },
  );

  const createPull = [
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
    `Moves \`sync/skills-pin.json\` to zgeoff/skills ${commit}, which zgeoff/skills sent from its green main. Once this merges and main is green, the sync dispatch sends the new skill text to every repo that takes it.\n\nAdds the new files of the skill folders it syncs to \`sync/manifest.json\`:\n\n- \`skills/kettle/references/descaling.md\`\n- \`skills/kettle/scripts/boil.sh\`\n\nChanges: https://github.com/zgeoff/skills/compare/${pinned}...${commit}`,
  ];

  ctx.commands.answer(createPull, {
    exitCode: 0,
    stdout: 'https://github.com/example/tools/pull/41\n',
    stderr: '',
  });

  const merge = [
    'gh',
    'pr',
    'merge',
    '41',
    '--repo',
    'example/tools',
    '--auto',
    '--squash',
    '--match-head-commit',
    'beefcafe0123456789abcdef0123456789abcdef',
  ];

  ctx.commands.answer(merge, { exitCode: 0, stdout: '', stderr: '' });

  const exitCode = await ctx.pin(commit);

  await writeTreeFiles(join(ctx.directory, 'check'), {
    'sync/manifest.json': expectedManifest,
    'tree/skills/kettle/SKILL.md': '# Kettle\n',
    'tree/skills/kettle/references/descaling.md': '# Descaling\n',
    'tree/skills/kettle/references/limescale.md': '# Limescale\n',
    'tree/skills/kettle/scripts/boil.sh': 'echo boiling\n',
  });

  const checked = await $`bash ${ctx.checkScriptPath} sync/manifest.json tree`
    .cwd(join(ctx.directory, 'check'))
    .nothrow()
    .quiet();

  expect(exitCode).toBe(0);
  expect(ctx.commands.calls).toIncludeAllMembers([writeManifest, createPull]);
  expect(ctx.commands.calls.at(-1)).toStrictEqual(merge);

  expect({ exitCode: checked.exitCode, stderr: checked.stderr.toString() }).toStrictEqual({
    exitCode: 0,
    stderr: '',
  });
});

test('it leaves the manifest alone when only a skill folder no entry ships gains a file', async () => {
  const ctx = await setupTest();

  const pinned = '0123456789abcdef0123456789abcdef01234567';
  const commit = '89abcdef0123456789abcdef0123456789abcdef';

  const manifest = [
    {
      name: 'skill-kettle',
      description: 'The kettle skill',
      files: [
        {
          repo: 'zgeoff/skills',
          source: 'skills/kettle/SKILL.md',
          target: '.claude/skills/kettle/SKILL.md',
        },
      ],
    },
  ];

  const manifestText = JSON.stringify(manifest);

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

  ctx.commands.answer(['git', 'rev-parse', 'HEAD'], {
    exitCode: 0,
    stdout: 'fedcba9876543210fedcba9876543210fedcba98\n',
    stderr: '',
  });

  ctx.commands.answer(['gh', 'api', `repos/zgeoff/skills/git/trees/${commit}?recursive=1`], {
    exitCode: 0,
    stdout: JSON.stringify({
      truncated: false,
      tree: [
        { path: 'skills/kettle/SKILL.md', mode: '100644', type: 'blob' },
        { path: 'skills/teapot/SKILL.md', mode: '100644', type: 'blob' },
        { path: 'skills/teapot/references/brewing.md', mode: '100644', type: 'blob' },
      ],
    }),
    stderr: '',
  });

  ctx.commands.answer(
    [
      'gh',
      'api',
      'repos/example/tools/contents/sync/manifest.json?ref=fedcba9876543210fedcba9876543210fedcba98',
    ],
    {
      exitCode: 0,
      stdout: JSON.stringify({
        sha: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33',
        content: Buffer.from(manifestText).toString('base64'),
        encoding: 'base64',
      }),
      stderr: '',
    },
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
    ['gh', 'api', '--silent', '-X', 'DELETE', 'repos/example/tools/git/refs/heads/skills-pin-next'],
    { exitCode: 0, stdout: '', stderr: '' },
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

  const merge = [
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
  ];

  ctx.commands.answer(merge, { exitCode: 0, stdout: '', stderr: '' });

  const exitCode = await ctx.pin(commit);

  const manifestWrites = ctx.commands.calls.filter((argv) =>
    argv.includes('repos/example/tools/contents/sync/manifest.json'),
  );

  expect(exitCode).toBe(0);
  expect(manifestWrites).toStrictEqual([]);
  expect(ctx.commands.calls.at(-1)).toStrictEqual(merge);
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

  ctx.commands.answer(['git', 'rev-parse', 'HEAD'], {
    exitCode: 0,
    stdout: 'fedcba9876543210fedcba9876543210fedcba98\n',
    stderr: '',
  });

  ctx.commands.answer(['gh', 'api', `repos/zgeoff/skills/git/trees/${commit}?recursive=1`], {
    exitCode: 0,
    stdout: JSON.stringify({
      truncated: false,
      tree: [{ path: 'skills/kettle/SKILL.md', mode: '100644', type: 'blob' }],
    }),
    stderr: '',
  });

  ctx.commands.answer(
    [
      'gh',
      'api',
      'repos/example/tools/contents/sync/manifest.json?ref=fedcba9876543210fedcba9876543210fedcba98',
    ],
    {
      exitCode: 0,
      stdout: JSON.stringify({
        sha: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33',
        content: Buffer.from('[]\n').toString('base64'),
        encoding: 'base64',
      }),
      stderr: '',
    },
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

  ctx.commands.answer(['git', 'rev-parse', 'HEAD'], {
    exitCode: 0,
    stdout: 'fedcba9876543210fedcba9876543210fedcba98\n',
    stderr: '',
  });

  ctx.commands.answer(['gh', 'api', `repos/zgeoff/skills/git/trees/${commit}?recursive=1`], {
    exitCode: 0,
    stdout: JSON.stringify({
      truncated: false,
      tree: [{ path: 'skills/kettle/SKILL.md', mode: '100644', type: 'blob' }],
    }),
    stderr: '',
  });

  ctx.commands.answer(
    [
      'gh',
      'api',
      'repos/example/tools/contents/sync/manifest.json?ref=fedcba9876543210fedcba9876543210fedcba98',
    ],
    {
      exitCode: 0,
      stdout: JSON.stringify({
        sha: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33',
        content: Buffer.from('[]\n').toString('base64'),
        encoding: 'base64',
      }),
      stderr: '',
    },
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

  ctx.commands.answer(
    ['gh', 'pr', 'view', '41', '--repo', 'example/tools', '--json', 'state', '--jq', '.state'],
    { exitCode: 0, stdout: 'OPEN\n', stderr: '' },
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

// The open pull request can merge or close after the run read it. An edit would then change a pull
// request that is no longer open and leave the new pin with none.
test.each([
  {
    label: 'opens a new one from main once main shows the merged pin',
    state: 'MERGED',
    mainPinKind: 'proposed',
    expectedExitCode: 0,
    opensNew: true,
  },
  {
    label: 'stops with nothing to do once main shows its own pin',
    state: 'MERGED',
    mainPinKind: 'commit',
    expectedExitCode: 0,
    opensNew: false,
  },
  {
    label: 'fails when main shows another pin',
    state: 'MERGED',
    mainPinKind: 'other',
    expectedExitCode: 1,
    opensNew: false,
  },
  {
    label: 'opens a new one from the checkout',
    state: 'CLOSED',
    mainPinKind: 'proposed',
    expectedExitCode: 0,
    opensNew: true,
  },
])('it $label, when the open pin pull request is no longer open', async (row) => {
  const ctx = await setupTest();

  const pinned = '0123456789abcdef0123456789abcdef01234567';
  const proposed = '456789abcdef0123456789abcdef0123456789ab';
  const commit = '89abcdef0123456789abcdef0123456789abcdef';

  const mainPins: Readonly<Record<string, string>> = {
    proposed,
    commit,
    other: '0fedcba987654321fedcba987654321fedcba98',
  };

  const compareBase = row.state === 'MERGED' ? proposed : pinned;

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

  ctx.commands.answer(['git', 'rev-parse', 'HEAD'], {
    exitCode: 0,
    stdout: 'fedcba9876543210fedcba9876543210fedcba98\n',
    stderr: '',
  });

  ctx.commands.answer(['gh', 'api', `repos/zgeoff/skills/git/trees/${commit}?recursive=1`], {
    exitCode: 0,
    stdout: JSON.stringify({
      truncated: false,
      tree: [{ path: 'skills/kettle/SKILL.md', mode: '100644', type: 'blob' }],
    }),
    stderr: '',
  });

  ctx.commands.answer(
    [
      'gh',
      'api',
      'repos/example/tools/contents/sync/manifest.json?ref=fedcba9876543210fedcba9876543210fedcba98',
    ],
    {
      exitCode: 0,
      stdout: JSON.stringify({
        sha: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33',
        content: Buffer.from('[]\n').toString('base64'),
        encoding: 'base64',
      }),
      stderr: '',
    },
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

  ctx.commands.answer(
    ['gh', 'pr', 'view', '41', '--repo', 'example/tools', '--json', 'state', '--jq', '.state'],
    { exitCode: 0, stdout: `${row.state}\n`, stderr: '' },
  );

  ctx.commands.answer(
    ['gh', 'api', 'repos/example/tools/git/ref/heads/main', '--jq', '.object.sha'],
    { exitCode: 0, stdout: 'abad1dea0123456789abcdef0123456789abcdef\n', stderr: '' },
  );

  ctx.commands.answer(
    [
      'gh',
      'api',
      'repos/example/tools/contents/sync/skills-pin.json?ref=abad1dea0123456789abcdef0123456789abcdef',
      '-H',
      'Accept: application/vnd.github.raw',
    ],
    { exitCode: 0, stdout: JSON.stringify({ commit: mainPins[row.mainPinKind] }), stderr: '' },
  );

  ctx.commands.answer(
    [
      'gh',
      'api',
      'repos/example/tools/contents/sync/manifest.json?ref=abad1dea0123456789abcdef0123456789abcdef',
    ],
    {
      exitCode: 0,
      stdout: JSON.stringify({
        sha: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33',
        content: Buffer.from('[]\n').toString('base64'),
        encoding: 'base64',
      }),
      stderr: '',
    },
  );

  ctx.commands.answer(
    [
      'gh',
      'api',
      '--silent',
      'repos/example/tools/git/refs',
      '-f',
      'ref=refs/heads/skills-pin-next',
      '-f',
      'sha=abad1dea0123456789abcdef0123456789abcdef',
    ],
    { exitCode: 0, stdout: '', stderr: '' },
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
      `Moves \`sync/skills-pin.json\` to zgeoff/skills ${commit}, which zgeoff/skills sent from its green main. Once this merges and main is green, the sync dispatch sends the new skill text to every repo that takes it.\n\nChanges: https://github.com/zgeoff/skills/compare/${compareBase}...${commit}`,
    ],
    { exitCode: 0, stdout: 'https://github.com/example/tools/pull/42\n', stderr: '' },
  );

  ctx.commands.answer(
    [
      'gh',
      'pr',
      'merge',
      '42',
      '--repo',
      'example/tools',
      '--auto',
      '--squash',
      '--match-head-commit',
      'c0ffee0123456789abcdef0123456789abcdef01',
    ],
    { exitCode: 0, stdout: '', stderr: '' },
  );

  const exitCode = await ctx.pin(commit);

  const merges = ctx.commands.calls.filter((argv) => argv[1] === 'pr' && argv[2] === 'merge');

  expect(exitCode).toBe(row.expectedExitCode);

  const expectedMerges = row.opensNew
    ? [
        [
          'gh',
          'pr',
          'merge',
          '42',
          '--repo',
          'example/tools',
          '--auto',
          '--squash',
          '--match-head-commit',
          'c0ffee0123456789abcdef0123456789abcdef01',
        ],
      ]
    : [];

  expect(merges).toStrictEqual(expectedMerges);
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

// A retry after a run that stopped before its auto-merge call finds the branch identical, and a
// late, older dispatch finds it behind; either one turns auto-merge on for the branch as it stands.
test.each([
  ['a newer open pin, for an older dispatch', 'behind', ['sync/skills-pin.json'], 0],
  ['the same open pin, for a retried dispatch', 'identical', ['sync/skills-pin.json'], 0],
  [
    'an open pin branch that changes another file',
    'identical',
    ['sync/skills-pin.json', 'README.md'],
    1,
  ],
])(
  'it keeps the branch for %s and binds auto-merge only to a pin-only head',
  async (_label, sinceProposed, paths, expectedExitCode) => {
    const ctx = await setupTest();

    const pinned = '0123456789abcdef0123456789abcdef01234567';
    const commit = '456789abcdef0123456789abcdef0123456789ab';
    const proposed = '89abcdef0123456789abcdef0123456789abcdef';
    const head = 'c0ffee0123456789abcdef0123456789abcdef01';

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

    const viewOpen = [
      'gh',
      'pr',
      'view',
      '41',
      '--repo',
      'example/tools',
      '--json',
      'headRefOid,files',
    ];

    const readHeadPin = [
      'gh',
      'api',
      `repos/example/tools/contents/sync/skills-pin.json?ref=${head}`,
      '-H',
      'Accept: application/vnd.github.raw',
    ];

    const merge = [
      'gh',
      'pr',
      'merge',
      '41',
      '--repo',
      'example/tools',
      '--auto',
      '--squash',
      '--match-head-commit',
      head,
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

    ctx.commands.answer(compareToProposed, {
      exitCode: 0,
      stdout: `${sinceProposed}\n`,
      stderr: '',
    });

    ctx.commands.answer(compareToMain, { exitCode: 0, stdout: 'ahead\n', stderr: '' });

    ctx.commands.answer(viewOpen, {
      exitCode: 0,
      stdout: JSON.stringify({ headRefOid: head, files: paths.map((path) => ({ path })) }),
      stderr: '',
    });

    ctx.commands.answer(readHeadPin, {
      exitCode: 0,
      stdout: JSON.stringify({ commit: proposed }),
      stderr: '',
    });

    ctx.commands.answer(merge, { exitCode: 0, stdout: '', stderr: '' });

    const exitCode = await ctx.pin(commit);

    const reads = [listOpen, readProposed, compareToPin, compareToProposed, compareToMain];
    const merged = expectedExitCode === 0 ? [merge] : [];

    expect(exitCode).toBe(expectedExitCode);
    expect(ctx.commands.calls).toStrictEqual([...reads, viewOpen, readHeadPin, ...merged]);

    expect(ctx.output[0]).toBe(
      `Nothing to pin: the open pin pull request already pins ${commit} or a newer commit.\n`,
    );
  },
);

test.each([
  ['the manifest the run writes for the pin', 'skills/kettle/references/descaling.md', 0],
  ['a manifest that lists another file', 'skills/kettle/references/whistle.md', 1],
])(
  'it binds auto-merge to an open pin branch that also changes the manifest only for %s',
  async (_label, headSource, expectedExitCode) => {
    const ctx = await setupTest();

    const pinned = '0123456789abcdef0123456789abcdef01234567';
    const commit = '456789abcdef0123456789abcdef0123456789ab';
    const proposed = '89abcdef0123456789abcdef0123456789abcdef';
    const head = 'beefcafe0123456789abcdef0123456789abcdef';
    const base = 'fedcba9876543210fedcba9876543210fedcba98';

    const manifest = [
      {
        name: 'skill-kettle',
        description: 'The kettle skill',
        files: [
          {
            repo: 'zgeoff/skills',
            source: 'skills/kettle/SKILL.md',
            target: '.claude/skills/kettle/SKILL.md',
          },
        ],
      },
    ];

    const manifestText = JSON.stringify(manifest);

    const headManifest = `[
  {
    "name": "skill-kettle",
    "description": "The kettle skill",
    "files": [
      {
        "repo": "zgeoff/skills",
        "source": "skills/kettle/SKILL.md",
        "target": ".claude/skills/kettle/SKILL.md"
      },
      {
        "repo": "zgeoff/skills",
        "source": "${headSource}",
        "target": ".claude/skills/kettle/${headSource.slice('skills/kettle/'.length)}"
      }
    ]
  }
]
`;

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
      { exitCode: 0, stdout: 'behind\n', stderr: '' },
    );

    ctx.commands.answer(
      ['gh', 'api', `repos/zgeoff/skills/compare/${commit}...main`, '--jq', '.status'],
      { exitCode: 0, stdout: 'ahead\n', stderr: '' },
    );

    ctx.commands.answer(
      ['gh', 'pr', 'view', '41', '--repo', 'example/tools', '--json', 'headRefOid,files'],
      {
        exitCode: 0,
        stdout: JSON.stringify({
          headRefOid: head,
          files: [{ path: 'sync/manifest.json' }, { path: 'sync/skills-pin.json' }],
        }),
        stderr: '',
      },
    );

    ctx.commands.answer(
      [
        'gh',
        'api',
        `repos/example/tools/contents/sync/skills-pin.json?ref=${head}`,
        '-H',
        'Accept: application/vnd.github.raw',
      ],
      { exitCode: 0, stdout: JSON.stringify({ commit: proposed }), stderr: '' },
    );

    ctx.commands.answer(
      ['gh', 'api', `repos/example/tools/compare/main...${head}`, '--jq', '.merge_base_commit.sha'],
      { exitCode: 0, stdout: `${base}\n`, stderr: '' },
    );

    ctx.commands.answer(['gh', 'api', `repos/zgeoff/skills/git/trees/${proposed}?recursive=1`], {
      exitCode: 0,
      stdout: JSON.stringify({
        truncated: false,
        tree: [
          { path: 'skills/kettle/SKILL.md', mode: '100644', type: 'blob' },
          { path: 'skills/kettle/references/descaling.md', mode: '100644', type: 'blob' },
        ],
      }),
      stderr: '',
    });

    ctx.commands.answer(
      ['gh', 'api', `repos/example/tools/contents/sync/manifest.json?ref=${base}`],
      {
        exitCode: 0,
        stdout: JSON.stringify({
          sha: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33',
          content: Buffer.from(manifestText).toString('base64'),
          encoding: 'base64',
        }),
        stderr: '',
      },
    );

    ctx.commands.answer(
      [
        'gh',
        'api',
        `repos/example/tools/contents/sync/manifest.json?ref=${head}`,
        '-H',
        'Accept: application/vnd.github.raw',
      ],
      { exitCode: 0, stdout: headManifest, stderr: '' },
    );

    const merge = [
      'gh',
      'pr',
      'merge',
      '41',
      '--repo',
      'example/tools',
      '--auto',
      '--squash',
      '--match-head-commit',
      head,
    ];

    ctx.commands.answer(merge, { exitCode: 0, stdout: '', stderr: '' });

    const exitCode = await ctx.pin(commit);

    const merges = ctx.commands.calls.filter((argv) => argv[1] === 'pr' && argv[2] === 'merge');
    const expectedMerges = expectedExitCode === 0 ? [merge] : [];

    expect(exitCode).toBe(expectedExitCode);
    expect(merges).toStrictEqual(expectedMerges);
  },
);

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

test('it fails and writes nothing when GitHub cannot compare the open pin', async () => {
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
    { exitCode: 1, stdout: '', stderr: 'gh: Server Error (HTTP 502)' },
  );

  const pinning = ctx.pin(commit);

  expect(pinning).rejects.toThrow(
    `gh api compare ${proposed}...${commit} failed: gh: Server Error (HTTP 502)`,
  );

  expect(ctx.commands.calls).toHaveLength(4);
});
