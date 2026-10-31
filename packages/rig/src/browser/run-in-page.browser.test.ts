// The page code runs in Chrome, so it type-checks against the DOM.
/// <reference lib="dom" />

import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { runInPage } from './run-in-page.ts';

async function setupTest() {
  const view = new Bun.WebView({ backend: 'chrome' });

  onTestFinished(() => {
    view.close();
  });

  await view.navigate('about:blank');

  return { view };
}

test('it runs the function in the page with its argument and returns the result the schema parses', async () => {
  const ctx = await setupTest();

  const result = await runInPage(
    ctx.view,
    (terms: readonly [number, number]) => ({ sum: terms[0] + terms[1], url: location.href }),
    [2, 3],
    z.object({ sum: z.number(), url: z.string() }),
  );

  expect(result).toStrictEqual({ sum: 5, url: 'about:blank' });
});

test("it returns the schema's output, which can differ from what the page returns", async () => {
  const ctx = await setupTest();

  const result = await runInPage(
    ctx.view,
    (terms: readonly [number, number]) => terms[0] + terms[1],
    [2, 3],
    z.number().transform(String),
  );

  expect(result).toBe('5');
});

test("it returns the output of a schema that parses the page's result asynchronously", async () => {
  const ctx = await setupTest();

  const result = await runInPage(
    ctx.view,
    () => 'buy milk',
    undefined,
    z.string().transform(async (note) => {
      await Promise.resolve();

      return note.toUpperCase();
    }),
  );

  expect(result).toBe('BUY MILK');
});

test('it returns the result of a function that awaits in the page', async () => {
  const ctx = await setupTest();

  const result = await runInPage(
    ctx.view,
    async (note: string) => {
      const blob = new Blob([note]);

      return { text: await blob.text() };
    },
    'buy milk',
    z.object({ text: z.string() }),
  );

  expect(result).toStrictEqual({ text: 'buy milk' });
});

test('it gives the page an argument with every key that its JSON holds', async () => {
  const ctx = await setupTest();

  const argument: unknown = JSON.parse('{"__proto__":{"flag":true},"note":"buy milk"}');

  if (typeof argument !== 'object' || argument === null) {
    throw new Error('the argument is no object');
  }

  const pageResult = z.object({ keys: z.array(z.string()), hasInheritedFlag: z.boolean() });

  const result = await runInPage(
    ctx.view,
    (pageArgument: object) => ({
      keys: Object.keys(pageArgument),
      hasInheritedFlag: 'flag' in pageArgument,
    }),
    argument,
    pageResult,
  );

  expect(result).toStrictEqual({ keys: ['__proto__', 'note'], hasInheritedFlag: false });
});

test('it calls the function with no argument when the argument is undefined', async () => {
  const ctx = await setupTest();

  const result = await runInPage(
    ctx.view,
    (...pageArguments: undefined[]) => ({ argumentCount: pageArguments.length }),
    undefined,
    z.object({ argumentCount: z.number() }),
  );

  expect(result).toStrictEqual({ argumentCount: 0 });
});

test('it refuses a bound function, whose source the page cannot read as an expression', async () => {
  const ctx = await setupTest();

  const notes = {
    count(note: string) {
      return note.length;
    },
  };

  const result = runInPage(ctx.view, notes.count.bind(notes), 'buy milk', z.number());

  const failure = await result.then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({
    message:
      'runInPage takes an arrow function or a function expression, never a method or a bound function',
  });
});

test.each([
  ['a Date', new Date(0)],
  ['a Map', new Map([['note', 'buy milk']])],
  ['a function', () => 'buy milk'],
])(
  'it refuses %s as the argument, which JSON would change on the way to the page',
  async (_, argument) => {
    const ctx = await setupTest();

    const result = runInPage(
      ctx.view,
      (pageArgument: unknown) => typeof pageArgument,
      argument,
      z.string(),
    );

    const failure = await result.then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toMatchObject({
      message: 'runInPage takes an argument that JSON carries to the page unchanged',
    });
  },
);

test('it refuses a result that loses its fields on the way out of the page', async () => {
  const ctx = await setupTest();

  const result = runInPage(
    ctx.view,
    () => new Blob(['note']),
    null,
    z.object({ size: z.number() }),
  );

  const failure = await result.then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({
    message: expect.stringMatching(/^the page's result fails its schema: size: /u),
    cause: [{ path: ['size'] }],
  });
});
