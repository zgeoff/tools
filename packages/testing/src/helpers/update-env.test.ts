import { expect, onTestFinished, test } from 'bun:test';
import { removeEnvOverrides } from './remove-env-overrides.ts';
import { updateEnv } from './update-env.ts';

function setupTest(): void {
  onTestFinished(removeEnvOverrides);
}

test('it sets a variable, and removeEnvOverrides restores the original', () => {
  setupTest();

  process.env['KETTLE_MODE'] = 'cold';

  updateEnv('KETTLE_MODE', 'boiling');

  expect(process.env['KETTLE_MODE']).toBe('boiling');

  removeEnvOverrides();

  expect(process.env['KETTLE_MODE']).toBe('cold');
});

test('it deletes a variable that was unset when removeEnvOverrides restores it', () => {
  setupTest();
  delete process.env['KETTLE_LID'];
  updateEnv('KETTLE_LID', 'open');
  removeEnvOverrides();

  expect(process.env['KETTLE_LID']).toBeUndefined();
  expect('KETTLE_LID' in process.env).toBe(false);
});

test('it keeps the first original through a second override of the name', () => {
  setupTest();

  process.env['KETTLE_MODE'] = 'cold';

  updateEnv('KETTLE_MODE', 'warm');
  updateEnv('KETTLE_MODE', 'boiling');
  removeEnvOverrides();

  expect(process.env['KETTLE_MODE']).toBe('cold');
});

test('it deletes the variable when the value is undefined', () => {
  setupTest();

  process.env['KETTLE_MODE'] = 'cold';

  updateEnv('KETTLE_MODE', undefined);

  expect('KETTLE_MODE' in process.env).toBe(false);

  removeEnvOverrides();

  expect(process.env['KETTLE_MODE']).toBe('cold');
});

test('it forgets the record after a restore', () => {
  setupTest();

  process.env['KETTLE_MODE'] = 'cold';

  updateEnv('KETTLE_MODE', 'boiling');
  removeEnvOverrides();

  process.env['KETTLE_MODE'] = 'tepid';

  removeEnvOverrides();

  expect(process.env['KETTLE_MODE']).toBe('tepid');
});
