import type { SimpleGit } from 'simple-git';
import { toContentHash } from './to-content-hash.ts';
import type { FileHashes } from './types.ts';

export async function readCommitHashes(
  git: SimpleGit,
  commit: string | null,
  relativePaths: readonly string[],
): Promise<FileHashes> {
  if (commit === null || relativePaths.length === 0) {
    return Object.fromEntries(relativePaths.map((relativePath) => [relativePath, null]));
  }

  const listing = await git.raw(['ls-tree', '-z', commit, '--', ...relativePaths]);

  const blobs = new Map(
    listing
      .split('\0')
      .map((entry) => /^\d+ blob (?<oid>\S+)\t(?<path>.+)$/u.exec(entry)?.groups)
      .flatMap((groups) =>
        groups?.['oid'] === undefined || groups['path'] === undefined
          ? []
          : [[groups['path'], groups['oid']] as const],
      ),
  );

  const entries = await Promise.all(
    relativePaths.map(async (relativePath) => {
      const oid = blobs.get(relativePath);
      const bytes = oid === undefined ? null : await git.showBuffer(oid);

      return [relativePath, bytes === null ? null : toContentHash(bytes)] as const;
    }),
  );

  return Object.fromEntries(entries);
}
