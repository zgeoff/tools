import { mock } from 'bun:test';
import type { StateCreator, StoreApi } from 'zustand/vanilla';
import { storeResets } from './store-resets.ts';

// zustand's own `create` builds its store through this module's `createStore`, so wrapping
// `createStore` here covers stores from `create`, from `zustand`, and from `zustand/vanilla`.
const actualVanilla = await import('zustand/vanilla');

// Captured before mock.module swaps the live binding; calling actualVanilla.createStore from inside
// the wrapper would recurse.
const actualCreateStore = actualVanilla.createStore;

function registerStoreReset<T>(store: StoreApi<T>): void {
  const initialState = store.getInitialState();

  // A WeakRef lets a store that a single test created be collected; a module-level store stays
  // reachable and is reset after every test.
  const storeRef = new WeakRef(store);

  const resetStore = (): void => {
    const liveStore = storeRef.deref();

    if (liveStore === undefined) {
      storeResets.delete(resetStore);

      return;
    }

    liveStore.setState(initialState, true);
  };

  storeResets.add(resetStore);
}

function createTrackedStore<T>(creator: StateCreator<T>) {
  const store = actualCreateStore(creator);

  registerStoreReset(store);

  return store;
}

function createStoreWithReset<T>(creator?: StateCreator<T>) {
  return typeof creator === 'function' ? createTrackedStore(creator) : createTrackedStore;
}

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- mirrors zustand's overloaded generic `createStore`; call-compatible but structurally distinct
const createStore = createStoreWithReset as typeof actualVanilla.createStore;

void mock.module('zustand/vanilla', () => ({ ...actualVanilla, createStore }));
