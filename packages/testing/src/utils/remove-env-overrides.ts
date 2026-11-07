import { envOriginals } from './env-originals.ts';

// Puts back every variable that updateEnv overrode, deleting it when it was unset, and clears the
// record. Call it in an afterEach hook of the test preload: afterEach(removeEnvOverrides).
export function removeEnvOverrides(): void {
  for (const [name, original] of envOriginals) {
    if (original === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = original;
    }
  }

  envOriginals.clear();
}
