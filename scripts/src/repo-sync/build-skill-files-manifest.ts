import { isRecord } from '../../../packages/std/src/is-record.ts';

export interface SkillFilesManifest {
  readonly manifest: unknown;

  // The zgeoff/skills sources the manifest gained, each once, however many entries gained it.
  readonly added: readonly string[];
}

export interface SkillsTreeFile {
  readonly path: string;

  // The git mode of the blob, such as `100644`, `100755` for an executable, or `120000` for a link.
  readonly mode: string;
}

const skillsRepo = 'zgeoff/skills';

// Adds to each entry the files of the zgeoff/skills tree that sit in a skill folder it ships and
// that it lacks. A folder no entry ships stays out, as syncing a new skill is a choice made by hand,
// and tests and links stay out, as the sync check skips them.
export function buildSkillFilesManifest(
  manifest: unknown,
  treeFiles: readonly SkillsTreeFile[],
): SkillFilesManifest {
  if (!Array.isArray(manifest)) {
    return { manifest, added: [] };
  }

  const added: string[] = [];

  const entries = manifest.map((entry: unknown) => {
    if (!isRecord(entry) || !Array.isArray(entry['files'])) {
      return entry;
    }

    const files = entry['files'].map((file: unknown): unknown => file);

    for (const folder of collectSkillFolders(files)) {
      for (const treeFile of treeFiles) {
        const path = treeFile.path;

        if (
          !path.startsWith(folder.source) ||
          path.endsWith('.test.ts') ||
          treeFile.mode === '120000'
        ) {
          continue;
        }

        if (files.some((file) => isSkillsFile(file) && file.source === path)) {
          continue;
        }

        const target = `${folder.target}${path.slice(folder.source.length)}`;
        const mode = treeFile.mode === '100755' ? { mode: '0755' } : {};

        files.splice(getInsertIndex(files, folder.source, path), 0, {
          repo: skillsRepo,
          source: path,
          target,
          ...mode,
        });

        if (!added.includes(path)) {
          added.push(path);
        }
      }
    }

    return { ...entry, files };
  });

  return { manifest: entries, added };
}

interface SkillFolder {
  // The folder in zgeoff/skills, such as `skills/testing/`, and where its files land in a repo.
  readonly source: string;
  readonly target: string;
}

// The target folder comes from a file whose target ends in the file's path inside the folder,
// so a new file lands beside the files the entry already ships.
function collectSkillFolders(files: readonly unknown[]): SkillFolder[] {
  const folders = new Map<string, string>();

  for (const file of files) {
    if (!isSkillsFile(file) || !file.source.startsWith('skills/')) {
      continue;
    }

    const source = `${file.source.split('/').slice(0, 2).join('/')}/`;
    const inner = file.source.slice(source.length);

    if (!folders.has(source) && file.target.endsWith(`/${inner}`)) {
      folders.set(source, file.target.slice(0, -inner.length));
    }
  }

  return [...folders].map(([source, target]) => ({ source, target }));
}

interface SkillsFile {
  readonly source: string;
  readonly target: string;
}

function isSkillsFile(file: unknown): file is SkillsFile {
  return (
    isRecord(file) &&
    file['repo'] === skillsRepo &&
    typeof file['source'] === 'string' &&
    typeof file['target'] === 'string'
  );
}

// Places the file after the last file of its folder that sorts before it, or before the folder's
// first file when none does, so the folder's files stay in order and other files keep their place.
function getInsertIndex(files: readonly unknown[], folder: string, path: string): number {
  let index = -1;

  for (const [position, file] of files.entries()) {
    if (!isSkillsFile(file) || !file.source.startsWith(folder)) {
      continue;
    }

    if (file.source < path) {
      index = position + 1;
    } else if (index === -1) {
      index = position;
    }
  }

  return index;
}
