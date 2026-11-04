import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRunFolderPrefix, writeTreeFiles } from '@zgeoff/testing/helpers';
import { probeWorkspaceRepo } from './probe-workspace-repo.ts';

async function setupTest(files: Readonly<Record<string, string>>) {
  const repoRoot = await mkdtemp(join(tmpdir(), readRunFolderPrefix('rig-workspace-')));

  onTestFinished(() => rm(repoRoot, { recursive: true, force: true }));

  await writeTreeFiles(repoRoot, files);

  return repoRoot;
}

test('it finds a repo whose package.json declares workspaces', async () => {
  const repoRoot = await setupTest({ 'package.json': '{ "workspaces": ["packages/*"] }' });
  const result = await probeWorkspaceRepo(repoRoot);

  expect(result).toBeTrue();
});

test('it finds a repo whose package.json has no workspaces to be a single package', async () => {
  const repoRoot = await setupTest({ 'package.json': '{ "name": "kettle" }' });
  const result = await probeWorkspaceRepo(repoRoot);

  expect(result).toBeFalse();
});

test('it finds a repo with no package.json to be a single package', async () => {
  const repoRoot = await setupTest({});
  const result = await probeWorkspaceRepo(repoRoot);

  expect(result).toBeFalse();
});
