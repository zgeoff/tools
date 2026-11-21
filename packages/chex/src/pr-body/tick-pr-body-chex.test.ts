import { expect, test } from 'bun:test';
import { tickPrBodyChex } from './tick-pr-body-chex.ts';

test('it ticks the chex line and leaves every other byte alone', () => {
  const body = '## Description\n\nIntro.\n\n## Checks\n\n- [ ] chex\n- [x] Deslop (a1b2c3d)\n';

  expect(tickPrBodyChex(body, true)).toBe(body.replace('- [ ] chex', '- [x] chex'));
});

test('it unticks the chex line', () => {
  expect(tickPrBodyChex('- [x] chex\r\ntrailing  \r\n', false)).toBe(
    '- [ ] chex\r\ntrailing  \r\n',
  );
});

test('it prints a body with no chex line unchanged', () => {
  expect(tickPrBodyChex('## Description\n\nText.\n', true)).toBe('## Description\n\nText.\n');
});

test('it skips an example chex line inside an HTML comment', () => {
  const template = '<!--\n- [ ] chex\n-->\n\n- [ ] chex\n';

  expect(tickPrBodyChex(template, true)).toBe('<!--\n- [ ] chex\n-->\n\n- [x] chex\n');
});

test('it leaves a line that only starts with the words alone', () => {
  expect(tickPrBodyChex('- [ ] chex later\n', true)).toBe('- [ ] chex later\n');
});
