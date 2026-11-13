import { expect, test } from 'bun:test';
import { buildTestRequester } from './build-test-requester.ts';

test('it builds a requester with a socket address and a user agent', () => {
  expect(buildTestRequester()).toStrictEqual({
    socketAddress: '127.0.0.1',
    connectingIP: null,
    userAgent: 'test-client',
  });
});

test('it takes the fields it is given in place of the defaults', () => {
  const requester = buildTestRequester({
    connectingIP: { address: '203.0.113.9', provenance: 'trusted' },
  });

  expect(requester.connectingIP).toStrictEqual({ address: '203.0.113.9', provenance: 'trusted' });
});
