export const rigE2EBinVariable = 'RIG_E2E_BIN';

export function getRigE2EBin(environment: Readonly<Record<string, string | undefined>>): string {
  const binPath = environment[rigE2EBinVariable];

  if (binPath === undefined || binPath === '') {
    throw new Error(
      `${rigE2EBinVariable} names no rig bin; run the e2e lane through \`bun run test:e2e\`, which packs rig`,
    );
  }

  return binPath;
}
