import { mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { linkCommitlint } from './link-commitlint.ts';
import { writeStubPrograms } from './write-stub-programs.ts';
import { writeTreeFiles } from './write-tree-files.ts';

export interface ChexBaselineInstall {
  // The tools checkout, whose chex package the repo links and whose commitlint it can link.
  readonly toolsRoot: string;

  // The log the stub rig appends each call to.
  readonly rigLog: string;
}

export interface ChexBaselineFixture {
  // The chex checks that run for real; every other check prints that it cleared and passes.
  readonly realChecks?: readonly string[];

  readonly scripts?: Readonly<Record<string, string>>;

  readonly files?: Readonly<Record<string, string>>;

  // The body of the stub rig, which records its arguments first.
  readonly rig?: string;

  readonly oxlint?: string;

  // Links commitlint and its config into the repo, for the commits check.
  readonly withCommitlint?: boolean;
}

// Writes a repo as `chex init` leaves it, with the baseline's programs installed: chex from the
// tools checkout, and stubs of diet, rig and oxlint. The stub diet marks what it runs, so the stub
// rig logs "under diet:" before a call that diet wraps.
export async function createChexBaselineRepo(
  root: string,
  install: Readonly<ChexBaselineInstall>,
  fixture: Readonly<ChexBaselineFixture> = {},
): Promise<void> {
  const packageRoot = join(install.toolsRoot, 'packages/chex');
  const cliPath = join(packageRoot, 'src/cli.ts');
  const realChecks = (fixture.realChecks ?? []).join(' ');

  await mkdir(join(root, 'node_modules/@zgeoff'), { recursive: true });
  await symlink(packageRoot, join(root, 'node_modules/@zgeoff/chex'));

  await writeStubPrograms(join(root, 'node_modules/.bin'), {
    chex: `case " ${realChecks} " in *" $1 "*) exec ${process.execPath} ${cliPath} "$@" ;; esac\necho "cleared: $1"`,
    diet: '[ "$1" = -- ] && shift\nCHEX_STUB_UNDER_DIET=1 exec "$@"',
    oxlint: fixture.oxlint ?? 'exit 0',
    rig: `echo "\${CHEX_STUB_UNDER_DIET:+under diet: }$*" >> ${install.rigLog}\n${fixture.rig ?? 'exit 0'}`,
  });

  if (fixture.withCommitlint === true) {
    await linkCommitlint(root, install.toolsRoot);
  }

  await writeTreeFiles(root, {
    'lefthook.yml': 'extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n',
    '.gitignore': 'node_modules/\n',
    'package.json': JSON.stringify({
      scripts: {
        'format:check': 'true',
        typecheck: 'true',
        'check:docs': 'true',
        ...fixture.scripts,
      },
    }),
    ...fixture.files,
  });
}
