import { match } from 'ts-pattern';
import type { BenchVerdict } from './types.ts';

export type BaseSetupStep = 'checkout' | 'install';

export function findBaseSetupVerdict(
  step: BaseSetupStep,
  baseRef: string,
  exitCode: number,
): BenchVerdict | null {
  if (exitCode === 0) {
    return null;
  }

  const text = match(step)
    .with('checkout', () => `rig bench: could not check out "${baseRef}"\n`)
    .with('install', () => `rig bench: bun install failed in the checkout of "${baseRef}"\n`)
    .exhaustive();

  return { output: [{ stream: 'err', text }], exitCode: 1 };
}
