import { expect, test } from 'bun:test';
import { collectCheckedShas } from './collect-checked-shas.ts';

test('it lists each distinct hash on a ticked Deslop or Cold read line', () => {
  const body =
    '## Description\n\nText.\n\n## Checks\n\n- [ ] chex\n- [x] Deslop (a1b2c3d)\n- [x] Cold read (a1b2c3d)\n- [x] Cold read (9f8e7d6)\n';

  expect(collectCheckedShas(body)).toStrictEqual(['a1b2c3d', '9f8e7d6']);
});

test('it skips a placeholder, a line in a comment and a hash outside Checks', () => {
  const body =
    '## Description\n\nDeslop (a1b2c3d)\n\n## Checks\n\n<!--\n- [x] Deslop (1111111)\n-->\n- [x] Deslop (<sha>)\n';

  expect(collectCheckedShas(body)).toStrictEqual([]);
});
