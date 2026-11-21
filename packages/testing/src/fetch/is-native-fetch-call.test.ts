import { expect, test } from 'bun:test';
import { isNativeFetchCall } from './is-native-fetch-call.ts';

test.each([
  ['an IPv4 loopback URL', 'http://127.0.0.1:8080/health'],
  ['an IPv6 loopback URL', 'http://[::1]:8080/health'],
  ['a localhost URL', 'http://localhost:3000/'],
])('it sends %s to the native fetch', (_title, url) => {
  expect(isNativeFetchCall(url, undefined, ['127.0.0.1', '[::1]', 'localhost'])).toBeTrue();
});

test('it reads the host of a URL object and of a Request', () => {
  const results = [
    isNativeFetchCall(new URL('http://127.0.0.1:8080/'), undefined, [
      '127.0.0.1',
      '[::1]',
      'localhost',
    ]),
    isNativeFetchCall(new Request('http://localhost:3000/'), undefined, [
      '127.0.0.1',
      '[::1]',
      'localhost',
    ]),
  ];

  expect(results).toStrictEqual([true, true]);
});

test('it sends a call with the unix option to the native fetch, whatever its host', () => {
  expect(
    isNativeFetchCall('http://api.example.com/', { unix: '/run/kettle.sock' }, [
      '127.0.0.1',
      '[::1]',
      'localhost',
    ]),
  ).toBeTrue();
});

test('it sends a call to any other host to msw', () => {
  expect(
    isNativeFetchCall('https://api.example.com/v1', undefined, ['127.0.0.1', '[::1]', 'localhost']),
  ).toBeFalse();
});

test('it sends a call to msw when the URL cannot be parsed', () => {
  expect(
    isNativeFetchCall('/relative/path', undefined, ['127.0.0.1', '[::1]', 'localhost']),
  ).toBeFalse();
});

test('it takes the hosts the caller names in place of the defaults', () => {
  const results = [
    isNativeFetchCall('http://stub.test/', undefined, ['stub.test']),
    isNativeFetchCall('http://127.0.0.1:8080/', undefined, ['stub.test']),
  ];

  expect(results).toStrictEqual([true, false]);
});
