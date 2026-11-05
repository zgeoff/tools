import { types } from 'node:util';
import { runInNewContext } from 'node:vm';
import invariant from 'tiny-invariant';

// The promise comes from a `node:vm` context, whose `Promise` is not this realm's, so it fails
// `instanceof Promise` here as a bench file's promise from another realm does. The context chains
// `onTimeout`, so the promise it returns comes from that realm too.
export function createOtherRealmTimeout(
  delayMs: number,
  onTimeout: () => Promise<void> | void,
): Promise<void> {
  const timeout: unknown = runInNewContext(
    'new Promise((resolve) => setTimeout(resolve, delayMs)).then(() => onTimeout())',
    { setTimeout, delayMs, onTimeout },
  );

  invariant(isVoidPromise(timeout));

  return timeout;
}

function isVoidPromise(value: unknown): value is Promise<void> {
  return types.isPromise(value);
}
