import { expect, test } from 'bun:test';
import { pickSkillsPinMove } from './pick-skills-pin-move.ts';

test.each([
  ['with no open pin branch', null],
  ['past the pin of the open pin branch', 'ahead'],
])('it moves the pin to a commit on main past the pin %s', (_label, sinceProposed) => {
  const move = pickSkillsPinMove({
    commit: '89abcdef0123456789abcdef0123456789abcdef',
    sincePin: 'ahead',
    sinceProposed,
    mainSinceCommit: 'identical',
  });

  expect(move).toStrictEqual({ kind: 'move' });
});

test.each(['identical', 'behind'])(
  'it skips a commit that is %s to the pin on main',
  (sincePin) => {
    const move = pickSkillsPinMove({
      commit: '89abcdef0123456789abcdef0123456789abcdef',
      sincePin,
      sinceProposed: null,
      mainSinceCommit: 'ahead',
    });

    expect(move).toStrictEqual({
      kind: 'skip',
      reason:
        'main of zgeoff/tools already pins 89abcdef0123456789abcdef0123456789abcdef or a newer commit',
    });
  },
);

test.each(['identical', 'behind'])(
  'it skips a commit that is %s to the pin of the open pin branch',
  (sinceProposed) => {
    const move = pickSkillsPinMove({
      commit: '89abcdef0123456789abcdef0123456789abcdef',
      sincePin: 'ahead',
      sinceProposed,
      mainSinceCommit: 'ahead',
    });

    expect(move).toStrictEqual({
      kind: 'skip',
      reason:
        'the open pin pull request already pins 89abcdef0123456789abcdef0123456789abcdef or a newer commit',
    });
  },
);

test.each(['behind', 'diverged', ''])(
  'it refuses a commit that main of zgeoff/skills compares as %p',
  (mainSinceCommit) => {
    const move = pickSkillsPinMove({
      commit: '89abcdef0123456789abcdef0123456789abcdef',
      sincePin: 'ahead',
      sinceProposed: null,
      mainSinceCommit,
    });

    expect(move).toStrictEqual({
      kind: 'refused',
      message: '89abcdef0123456789abcdef0123456789abcdef is not a commit on main of zgeoff/skills',
    });
  },
);

test.each(['diverged', ''])('it refuses a commit that the pin compares as %p', (sincePin) => {
  const move = pickSkillsPinMove({
    commit: '89abcdef0123456789abcdef0123456789abcdef',
    sincePin,
    sinceProposed: null,
    mainSinceCommit: 'identical',
  });

  expect(move).toStrictEqual({
    kind: 'refused',
    message:
      '89abcdef0123456789abcdef0123456789abcdef does not descend from the commit main of zgeoff/tools pins',
  });
});
