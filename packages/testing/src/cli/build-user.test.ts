import { expect, test } from 'bun:test';
import { buildUser } from './build-user.ts';

function setupTest() {
  const written: string[] = [];

  return { written, user: buildUser((text) => written.push(text)) };
}

test('#type writes the text as it is', async () => {
  const ctx = setupTest();

  await ctx.user.type('hello');

  expect(ctx.written).toStrictEqual(['hello']);
});

test('#pressEnter writes a carriage return', async () => {
  const ctx = setupTest();

  await ctx.user.pressEnter();

  expect(ctx.written).toStrictEqual(['\r']);
});

test.each([
  ['up', '\u001B[A'],
  ['down', '\u001B[B'],
  ['right', '\u001B[C'],
  ['left', '\u001B[D'],
  ['space', ' '],
  ['enter', '\r'],
  ['tab', '\t'],
  ['escape', '\u001B'],
  ['backspace', '\u007F'],
] as const)('#press writes the code of %s', async (key, code) => {
  const ctx = setupTest();

  await ctx.user.press(key);

  expect(ctx.written).toStrictEqual([code]);
});

test('#cancel writes Ctrl+C', async () => {
  const ctx = setupTest();

  await ctx.user.cancel();

  expect(ctx.written).toStrictEqual(['\u0003']);
});
