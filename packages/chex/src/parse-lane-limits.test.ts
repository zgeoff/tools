import { expect, test } from 'bun:test';
import { parseLaneLimits } from './parse-lane-limits.ts';

test('it gives the standard lanes their limits when the repo has no oxlint config', () => {
  expect(parseLaneLimits(null)).toStrictEqual(
    new Map([
      ['browser', 10_000],
      ['e2e', 15_000],
      ['docker', 15_000],
      ['host', 15_000],
      ['agent-sdk', 5000],
      ['model-api', 120_000],
    ]),
  );
});

test('it adds a lane from the object form of the lanes option with its limit', () => {
  const limits = parseLaneLimits(
    '{ "rules": { "zgeoff/max-test-timeout": ["error", { "lanes": { "radar": 30000 } }] } }',
  );

  expect(limits.get('radar')).toBe(30_000);
});

test('it changes the limit of a standard lane that the object form names', () => {
  const limits = parseLaneLimits(
    '{ "rules": { "zgeoff/max-test-timeout": ["error", { "lanes": { "e2e": 20000 } }] } }',
  );

  expect(limits.get('e2e')).toBe(20_000);
});

test('it gives a lane from the array form of the lanes option a 15 s limit', () => {
  const limits = parseLaneLimits(
    '{\n  // the radar suites drive a real sensor\n  "rules": { "zgeoff/max-test-timeout": ["error", { "lanes": ["radar"] }] },\n}\n',
  );

  expect(limits.get('radar')).toBe(15_000);
});

test('it keeps the limit of a standard lane that the array form lists', () => {
  const limits = parseLaneLimits(
    '{ "rules": { "zgeoff/max-test-timeout": ["error", { "lanes": ["browser"] }] } }',
  );

  expect(limits.get('browser')).toBe(10_000);
});

test('it rejects an oxlint config it cannot parse', () => {
  expect(() => parseLaneLimits('{ "rules": ')).toThrowWithMessage(
    Error,
    /^cannot parse \.oxlintrc\.json: /u,
  );
});
