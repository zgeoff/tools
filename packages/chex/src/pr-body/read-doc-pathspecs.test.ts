import { expect, test } from 'bun:test';
import { parseDocPathspecs, readDocPathspecs } from './read-doc-pathspecs.ts';

test('it reads the README and doc pathspecs from the prose check script', () => {
  expect(readDocPathspecs()).toStrictEqual({
    readmes: [':(glob)**/README.md', ':(exclude,glob).claude/**', ':(exclude,glob).agents/**'],
    docs: [
      ':(glob)docs/**/*.md',
      ':(glob)**/results.md',
      ':(glob).agents/skills/**/*.md',
      ':(glob).claude/skills/**/*.md',
      ':(glob)skills/**/*.md',
      ':(glob)sync/skills/**/*.md',
    ],
  });
});

test('it throws when the script no longer lists pathspecs in the form it reads', () => {
  expect(() => parseDocPathspecs('#!/usr/bin/env bash\necho hi\n')).toThrow('check-prose.sh');
});
