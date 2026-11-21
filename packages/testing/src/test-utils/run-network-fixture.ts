import { join } from 'node:path';
import { createTempDir } from '../fs/create-temp-dir.ts';
import { writeTreeFiles } from '../fs/write-tree-files.ts';
import { run } from '../process/run.ts';
import type { RunResult } from '../process/types.ts';

const defaultNetworkSource = `
  import { HttpResponse, http } from 'msw';
  import { createTestNetwork } from './kit.ts';

  export const network = createTestNetwork({
    handlers: [http.get('https://default.example/status', () => HttpResponse.json({ up: true }))],
  });
`;

// Runs `bun test` in a temp project whose test preload is its network.ts, apart from the repo's
// network. Fixture files import the kit's fetch subpath from ./kit.ts. The default network.ts has
// one handler, GET https://default.example/status, which answers { up: true }.
export async function runNetworkFixture(
  files: Readonly<Record<string, string>>,
  testArgs: readonly string[] = [],
): Promise<RunResult> {
  const project = createTempDir('network-fixture');
  const packageRoot = join(import.meta.dir, '../..');

  await writeTreeFiles(project.path, {
    node_modules: { symlink: join(packageRoot, 'node_modules') },
    'kit.ts': `export * from ${JSON.stringify(join(packageRoot, 'src/fetch/index.ts'))};\n`,
    'network.ts': defaultNetworkSource,
    'bunfig.toml': '[test]\npreload = ["./network.ts"]\n',
    ...files,
  });

  return run(['bun', 'test', ...testArgs], {
    cwd: project.path,
    env: { NO_COLOR: '1' },
    timeoutMs: 60_000,
  });
}
