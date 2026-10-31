export const chexE2EPackageVariable = 'CHEX_E2E_PACKAGE';
export const chexE2EBinVariable = 'CHEX_E2E_BIN';

export interface ChexE2EPack {
  // The folder the packed chex extracts to, as an install leaves it in node_modules.
  readonly packageDir: string;

  readonly binPath: string;
}

export function getChexE2EPack(
  environment: Readonly<Record<string, string | undefined>>,
): ChexE2EPack {
  const packageDir = environment[chexE2EPackageVariable] ?? '';
  const binPath = environment[chexE2EBinVariable] ?? '';

  if (packageDir === '' || binPath === '') {
    throw new Error(
      `${chexE2EPackageVariable} and ${chexE2EBinVariable} name no packed chex; run the e2e lane through \`bun run test:e2e\`, which packs chex`,
    );
  }

  return { packageDir, binPath };
}
