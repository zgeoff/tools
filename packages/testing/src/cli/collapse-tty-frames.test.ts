import { expect, test } from 'bun:test';
import { collapseTTYFrames } from './collapse-tty-frames.ts';

test('it keeps plain text and line breaks', () => {
  expect(collapseTTYFrames('one\ntwo\n')).toBe('one\ntwo\n');
});

test('it keeps the last frame of a line that a carriage return redraws', () => {
  expect(collapseTTYFrames('loading 10%\rloading 90%\rdone     \n')).toBe('done     \n');
});

test('it keeps a CRLF line ending', () => {
  expect(collapseTTYFrames('one\r\ntwo\r\n')).toBe('one\ntwo\n');
});

test('it drops a character that a backspace removes', () => {
  expect(collapseTTYFrames('abc\b\bd')).toBe('ad');
});

test('it clears the line at an erase-line sequence', () => {
  expect(collapseTTYFrames('old text\u001B[2Knew text')).toBe('new text');
  expect(collapseTTYFrames('old text\u001B[Knew text')).toBe('new text');
});

test('it removes colour and cursor sequences', () => {
  expect(collapseTTYFrames('\u001B[1mbold\u001B[0m \u001B[?25lhidden cursor')).toBe(
    'bold hidden cursor',
  );
});

test('it removes the OSC 8 wrapper and keeps the link text', () => {
  expect(collapseTTYFrames('\u001B]8;;https://example.com\u0007docs\u001B]8;;\u0007 here')).toBe(
    'docs here',
  );
});
