import { expect, onTestFinished, test } from 'bun:test';
import { buildTestRequester } from '../test-utils/build-test-requester.ts';
import { openTestAuth } from '../test-utils/open-test-auth.ts';

async function setupTest() {
  const server = await openTestAuth();

  onTestFinished(() => server.close());

  return {
    ...server,
    readErrorPage: (query: string) =>
      server.auth.routes.error(
        new Request(`https://app.example/error?${query}`),
        buildTestRequester(),
      ),
  };
}

test('#answerErrorRequest shows the fixed sentence for an error code it knows', async () => {
  const ctx = await setupTest();
  const page = await ctx.readErrorPage('error=invalid_redirect');
  const html = await page.text();

  expect(page.status).toBe(400);
  expect(html).toInclude('the redirect URI is not one the client was added with.');
});

test('#answerErrorRequest never shows text the request carries', async () => {
  const ctx = await setupTest();

  const page = await ctx.readErrorPage(
    'error=invalid_client&error_description=Send+money+to+evil.example',
  );

  const html = await page.text();

  expect(html).not.toInclude('evil.example');
});

test.each([['error=made_up_code'], [''], ['error=constructor']])(
  '#answerErrorRequest shows the generic sentence for the query %p',
  async (query) => {
    const ctx = await setupTest();
    const page = await ctx.readErrorPage(query);
    const html = await page.text();

    expect(html).toInclude('the request is not valid.');
  },
);
