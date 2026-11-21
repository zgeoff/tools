import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createTempDir } from '../fs/create-temp-dir.ts';
import { removeFolder } from '../fs/remove-folder.ts';
import type { CleanupMode } from '../fs/types.ts';
import type { GitEnv } from './read-git-env.ts';
import { runGit } from './run-git.ts';
import type { TestCommit, TestRepo } from './types.ts';

// Builds each commit with `git commit-tree`, from the first parent's tree with the commit's files
// applied. It never runs `git merge`, so a merge commit has no conflicts and holds exactly that
// tree. Afterwards main and HEAD point at the last commit, and the work tree and index match it.
export async function createGitRepo(
  env: GitEnv,
  commits: readonly TestCommit[],
  options: { readonly cleanup?: CleanupMode } = {},
): Promise<TestRepo> {
  if (commits.length === 0) {
    throw new Error('createGitRepo needs at least one commit');
  }

  const repo = createTempDir('repo', options);

  try {
    await runGit(repo.path, env, ['init', '--quiet', '-b', 'main']);

    const shas: string[] = [];

    for (const [index, commit] of commits.entries()) {
      const parents = collectParents(commit, index, shas);

      const sha = await writeCommit(repo.path, env, commit, parents);

      shas.push(sha);
    }

    await runGit(repo.path, env, ['update-ref', 'refs/heads/main', shas.at(-1) ?? '']);
    await runGit(repo.path, env, ['reset', '--hard', '--quiet']);

    return { path: repo.path, commits: shas, remove: repo.remove };
  } catch (error) {
    repo.remove();
    throw error;
  }
}

// The shas of the commit's parents, the first parent first.
function collectParents(commit: TestCommit, index: number, shas: readonly string[]): string[] {
  const hasParents = index > 0 || commit.parent !== undefined;
  const further = [commit.merged ?? []].flat();
  const parentIndexes = hasParents ? [commit.parent ?? index - 1, ...further] : [];

  return parentIndexes.map((parentIndex) => {
    const sha = Number.isInteger(parentIndex) ? shas[parentIndex] : undefined;

    if (sha === undefined) {
      throw new Error(
        `commit ${index} (${commit.message}) names parent ${parentIndex}, which is not an earlier commit`,
      );
    }

    return sha;
  });
}

const defaultDate = '2026-01-01T00:00:00Z';

async function writeCommit(
  repo: string,
  env: GitEnv,
  commit: TestCommit,
  parents: readonly string[],
): Promise<string> {
  const indexPath = join(repo, '.git', 'zgeoff-testing-index');
  const indexEnv = { ...env, GIT_INDEX_FILE: indexPath };
  const date = commit.date ?? defaultDate;
  const [firstParent] = parents;
  const parentArgs = parents.flatMap((parent) => ['-p', parent]);

  removeFolder(indexPath);

  if (firstParent !== undefined) {
    await runGit(repo, indexEnv, ['read-tree', firstParent]);
  }

  await applyFiles(repo, indexEnv, commit.files);

  const tree = await runGit(repo, indexEnv, ['write-tree']);

  const commitEnv = { ...env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };

  const sha = await runGit(repo, commitEnv, [
    'commit-tree',
    tree.trim(),
    ...parentArgs,
    '-m',
    commit.message,
  ]);

  removeFolder(indexPath);

  return sha.trim();
}

const fileMode = '100644';
const symlinkMode = '120000';

// Puts each file in the index as a blob, and takes each null entry out of it.
async function applyFiles(
  repo: string,
  indexEnv: GitEnv,
  files: TestCommit['files'],
): Promise<void> {
  const blobFolder = join(repo, '.git', 'zgeoff-testing-blobs');
  const entries = Object.entries(files);
  const removed = entries.flatMap(([path, content]) => (content === null ? [path] : []));

  const added = entries.flatMap(([path, content], position) => {
    if (content === null) {
      return [];
    }

    const mode = typeof content === 'string' ? fileMode : symlinkMode;
    const text = typeof content === 'string' ? content : content.symlink;

    return [{ path, mode, text, blobPath: join(blobFolder, String(position)) }];
  });

  if (added.length > 0) {
    await mkdir(blobFolder, { recursive: true });

    await Promise.all(
      added.map(async (file) => {
        await mkdir(dirname(file.blobPath), { recursive: true });
        await writeFile(file.blobPath, file.text);
      }),
    );

    const hashes = await runGit(repo, indexEnv, [
      'hash-object',
      '-w',
      '--',
      ...added.map((file) => file.blobPath),
    ]);

    const shas = hashes.trim().split('\n');

    await runGit(repo, indexEnv, [
      'update-index',
      '--add',
      '--replace',
      ...added.flatMap((file, position) => [
        '--cacheinfo',
        `${file.mode},${shas[position] ?? ''},${file.path}`,
      ]),
    ]);

    removeFolder(blobFolder);
  }

  if (removed.length > 0) {
    await runGit(repo, indexEnv, ['update-index', '--force-remove', '--', ...removed]);
  }
}
