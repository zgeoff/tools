import { envOriginals } from './env-originals.ts';

// Sets process.env[name], or deletes it when value is undefined, and records the original so
// removeEnvOverrides can put it back. Call removeEnvOverrides in an afterEach hook of the test
// preload, so no override outlives its test.
export function updateEnv(name: string, value: string | undefined): void {
  if (!envOriginals.has(name)) {
    envOriginals.set(name, process.env[name]);
  }

  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
