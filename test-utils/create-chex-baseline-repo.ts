import { mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { ChexE2EPack } from './get-chex-e2e-pack.ts';
import { linkCommitlint } from './link-commitlint.ts';
import { writeStubPrograms } from './write-stub-programs.ts';
import { writeTreeFiles } from './write-tree-files.ts';

export interface ChexBaselineInstall {
  // The tools checkout, whose commitlint the repo can link.
  readonly toolsRoot: string;

  // The packed chex, which the repo links as its install.
  readonly chex: ChexE2EPack;

  // The log the stub rig appends each call to.
  readonly rigLog: string;
}

export interface ChexBaselineFixture {
  // The chex checks that run for real; every other check prints that it cleared and passes.
  readonly realChecks: readonly string[];

  // The scripts of package.json, which the format:check, typecheck and docs jobs run.
  readonly scripts: Readonly<Record<string, string>>;

  readonly files: Readonly<Record<string, string>>;

  // The body of the stub rig, which records its arguments first.
  readonly rig: string;

  readonly oxlint: string;

  // Links commitlint and its config into the repo, for the commits check.
  readonly withCommitlint: boolean;
}

// Writes a repo as `chex init` leaves it, with the baseline's programs installed: the packed chex,
// and stubs of diet, rig and oxlint. The stub diet marks what it runs, so the stub
// rig logs "under diet:" before a call that diet wraps.
export async function createChexBaselineRepo(
  root: string,
  install: Readonly<ChexBaselineInstall>,
  fixture: Readonly<ChexBaselineFixture>,
): Promise<void> {
  const cliPath = install.chex.binPath;
  const realChecks = fixture.realChecks.join(' ');

  await mkdir(join(root, 'node_modules/@zgeoff'), { recursive: true });
  await symlink(install.chex.packageDir, join(root, 'node_modules/@zgeoff/chex'));

  await writeStubPrograms(join(root, 'node_modules/.bin'), {
    chex: `case " ${realChecks} " in *" $1 "*) exec ${process.execPath} ${cliPath} "$@" ;; esac\necho "cleared: $1"`,
    diet: '[ "$1" = -- ] && shift\nCHEX_STUB_UNDER_DIET=1 exec "$@"',
    oxlint: fixture.oxlint,
    rig: `echo "\${CHEX_STUB_UNDER_DIET:+under diet: }$*" >> ${install.rigLog}\n${fixture.rig}`,
  });

  if (fixture.withCommitlint) {
    await linkCommitlint(root, install.toolsRoot);
  }

  await writeTreeFiles(root, {
    'lefthook.yml': 'extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n',
    '.gitignore': 'node_modules/\n',
    'package.json': JSON.stringify({ scripts: fixture.scripts }),
    ...fixture.files,
  });
}
