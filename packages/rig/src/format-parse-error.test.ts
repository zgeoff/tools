import { expect, test } from 'bun:test';
import { formatParseError } from './format-parse-error.ts';

test('it puts each reason of an aggregate error on a line of its own', () => {
  const error = new AggregateError(
    [new Error('Unknown option: --kettle'), new Error('Unknown option: --cup')],
    'the command line is refused',
  );

  expect(formatParseError(error)).toBe('Unknown option: --kettle\nUnknown option: --cup');
});

test('it gives the message of a plain error', () => {
  expect(formatParseError(new Error('the tea went cold'))).toBe('the tea went cold');
});
