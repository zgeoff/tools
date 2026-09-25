import './augment-bun-test.ts';
import { afterEach, expect } from 'bun:test';
import { registerHappyDOM } from './register-happy-dom.ts';
import { storeResets } from './store-resets.ts';

registerHappyDOM();

// Both imported after happy-dom registers: @testing-library/dom, which each one loads, binds
// `screen` to the `document` it finds at import time, and @testing-library/react also decides then
// whether to install its own auto-cleanup, which fires only for its first importer.
const { default: _jestDOMDefault, ...jestDOMMatchers } =
  await import('@testing-library/jest-dom/matchers');

const reactTestingLibrary = await import('@testing-library/react');

expect.extend(jestDOMMatchers);

afterEach(() => {
  // Unmount first: a store reset under a mounted tree re-renders it, and its effects write the
  // outgoing test's state back into the fresh stores.
  reactTestingLibrary.cleanup();

  for (const resetStore of storeResets) {
    resetStore();
  }
});
