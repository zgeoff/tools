import { expect, test } from 'bun:test';
import { buildMockHeadResponse } from './build-mock-head-response.ts';

test('it gives a null status rollup when no check or status has registered', () => {
  expect(buildMockHeadResponse('abc123', [])).toStrictEqual({
    data: { repository: { ref: { target: { oid: 'abc123', statusCheckRollup: null } } } },
  });
});

test('it lists check runs, from github-actions by default, before commit statuses', () => {
  const response = buildMockHeadResponse(
    'abc123',
    [
      { name: 'pr / checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { name: 'Socket', status: 'QUEUED', conclusion: null, app: 'socket-security' },
    ],
    [{ context: 'CodeRabbit', state: 'PENDING' }],
  );

  expect(response).toStrictEqual({
    data: {
      repository: {
        ref: {
          target: {
            oid: 'abc123',
            statusCheckRollup: {
              contexts: {
                nodes: [
                  {
                    __typename: 'CheckRun',
                    name: 'pr / checks',
                    status: 'COMPLETED',
                    conclusion: 'SUCCESS',
                    checkSuite: { app: { slug: 'github-actions' } },
                  },
                  {
                    __typename: 'CheckRun',
                    name: 'Socket',
                    status: 'QUEUED',
                    conclusion: null,
                    checkSuite: { app: { slug: 'socket-security' } },
                  },
                  { __typename: 'StatusContext', context: 'CodeRabbit', state: 'PENDING' },
                ],
              },
            },
          },
        },
      },
    },
  });
});
