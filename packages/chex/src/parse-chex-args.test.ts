import { expect, test } from 'bun:test';
import { parseChexArgs } from './parse-chex-args.ts';

test('it reads init alone as the init request', () => {
  expect(parseChexArgs(['init'])).toStrictEqual({ kind: 'init' });
});

test('it refuses init with an argument', () => {
  expect(parseChexArgs(['init', '--force'])).toStrictEqual({
    kind: 'refused',
    message: 'init takes no arguments',
  });
});

test('it refuses no words at all', () => {
  expect(parseChexArgs([])).toStrictEqual({ kind: 'refused', message: 'name a check to run' });
});

test('it reads several check names as several checks with no arguments, each once', () => {
  expect(parseChexArgs(['length', 'links', 'vision', 'links'])).toStrictEqual({
    kind: 'checks',
    names: ['length', 'links', 'vision'],
    args: [],
  });
});

test('it hands the words after one check name to that check', () => {
  expect(parseChexArgs(['workflows', '.github/workflows/pr.yml', 'links'])).toStrictEqual({
    kind: 'checks',
    names: ['workflows'],
    args: ['.github/workflows/pr.yml', 'links'],
  });
});

test('it hands an option to the check that reads it', () => {
  expect(parseChexArgs(['commits', '--pushed-refs'])).toStrictEqual({
    kind: 'checks',
    names: ['commits'],
    args: ['--pushed-refs'],
  });
});

test('it refuses an unknown first word', () => {
  expect(parseChexArgs(['spelling'])).toStrictEqual({
    kind: 'refused',
    message: 'unknown check "spelling"',
  });
});

test('it refuses arguments after two check names', () => {
  expect(parseChexArgs(['prose', 'links', 'README.md'])).toStrictEqual({
    kind: 'refused',
    message: '"README.md" is no check name; arguments follow one check name alone',
  });
});

test('it refuses an argument to a check that takes none', () => {
  expect(parseChexArgs(['length', 'README.md'])).toStrictEqual({
    kind: 'refused',
    message: 'length takes no arguments, and got "README.md"',
  });
});
