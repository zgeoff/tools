import { expect, test } from 'bun:test';
import { stat } from 'node:fs/promises';
import { resolveDietScript } from './resolve-diet-script.ts';

test('it resolves the diet script of the dependency to a file', async () => {
  const script = resolveDietScript();

  const status = await stat(script);

  expect(script).toEndWith('/diet.sh');
  expect(status.isFile()).toBeTrue();
});
