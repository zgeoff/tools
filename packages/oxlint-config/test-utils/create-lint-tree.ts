import { onTestFinished } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export type RuleSettings = Readonly<Record<string, unknown>>;

export type FileTree = Readonly<Record<string, string>>;

export async function createLintTree(files: FileTree, rules: RuleSettings): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'oxlint-config-test-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const config = { jsPlugins: [join(import.meta.dir, '..', 'plugin.js')], rules };

  await writeFile(join(directory, '.oxlintrc.json'), JSON.stringify(config));

  await Promise.all(
    Object.entries(files).map(async ([path, content]: readonly [string, string]) => {
      await mkdir(dirname(join(directory, path)), { recursive: true });
      await writeFile(join(directory, path), content);
    }),
  );

  return directory;
}
