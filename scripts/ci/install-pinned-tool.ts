import { join } from 'node:path';
import type { FileSystem } from './file-system.ts';
import { runCheckedCommand } from './run-checked-command.ts';
import type { RunCommand } from './run-command.ts';
import type { ToolPin } from './tool-pins.ts';

export interface ToolInstall {
  readonly name: string;

  readonly pin: ToolPin;

  readonly runnerTemp: string;

  readonly githubPath: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly fileSystem: Pick<
    FileSystem,
    'appendText' | 'createDirectory' | 'readBytes' | 'removePath'
  >;

  readonly runCommand: RunCommand;
}

// Installs the tool into a folder the runner owns and puts the folder on the PATH of the job's
// later steps. A download whose checksum differs from the pin installs nothing.
export async function installPinnedTool(install: Readonly<ToolInstall>): Promise<void> {
  const download = join(install.runnerTemp, `${install.name}.download`);
  const folder = join(install.runnerTemp, `${install.name}-bin`);
  const options = { cwd: install.runnerTemp, env: install.env };

  await runCheckedCommand(
    install.runCommand,
    ['curl', '-fsSL', '--retry', '3', '--retry-all-errors', '-o', download, install.pin.url],
    options,
  );

  const bytes = await install.fileSystem.readBytes(download);

  const sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');

  if (sha256 !== install.pin.sha256) {
    await install.fileSystem.removePath(download);

    throw new Error(
      `${install.name}: the download's sha256 is ${sha256}, not the pinned ${install.pin.sha256}`,
    );
  }

  await install.fileSystem.createDirectory(folder);

  await runCheckedCommand(
    install.runCommand,
    buildUnpackCommand(install, download, folder),
    options,
  );

  await install.fileSystem.appendText(install.githubPath, `${folder}\n`);
}

// A table typed over every packaging, so a new one fails the type check until it has a command.
const unpackCommands: Record<
  ToolPin['packaging'],
  (name: string, download: string, folder: string) => string[]
> = {
  binary: (name, download, folder) => ['install', '-m', '0755', download, join(folder, name)],
  'tar.gz': (name, download, folder) => ['tar', '-xzf', download, '-C', folder, name],
};

function buildUnpackCommand(
  install: Readonly<ToolInstall>,
  download: string,
  folder: string,
): string[] {
  return unpackCommands[install.pin.packaging](install.name, download, folder);
}
