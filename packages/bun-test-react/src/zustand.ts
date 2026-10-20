import { mock } from 'bun:test';
import type { Mutate, StateCreator, StoreApi, StoreMutatorIdentifier } from 'zustand/vanilla';
import { storeResets } from './store-resets.ts';

// zustand's own `create` builds its store through this module's `createStore`, so wrapping
// `createStore` here covers stores from `create`, from `zustand`, and from `zustand/vanilla`.
const actualVanilla = await import('zustand/vanilla');

// Captured before mock.module swaps the live binding; calling actualVanilla.createStore from inside
// the wrapper would recurse.
const actualCreateStore = actualVanilla.createStore;

type Mutators = [StoreMutatorIdentifier, unknown][];

function createStore<T, Mos extends Mutators = []>(
  initializer: StateCreator<T, [], Mos>,
): Mutate<StoreApi<T>, Mos>;

function createStore<T>(): <Mos extends Mutators = []>(
  initializer: StateCreator<T, [], Mos>,
) => Mutate<StoreApi<T>, Mos>;

function createStore<T, Mos extends Mutators = []>(initializer?: StateCreator<T, [], Mos>) {
  return initializer === undefined ? createTrackedStore : createTrackedStore(initializer);
}

function createTrackedStore<T, Mos extends Mutators = []>(
  initializer: StateCreator<T, [], Mos>,
): Mutate<StoreApi<T>, Mos> {
  // zustand hands the initializer the same store object it returns, typed as the plain store
  // before any middleware type wraps it; the initial state exists only once the initializer
  // returns, so the reset reads it when it runs
  return actualCreateStore<T, Mos>((setState, getState, store) => {
    registerStoreReset(store);

    return initializer(setState, getState, store);
  });
}

function registerStoreReset<T>(store: StoreApi<T>): void {
  // A WeakRef lets a store that a single test created be collected; a module-level store stays
  // reachable and is reset after every test.
  const storeRef = new WeakRef(store);

  const resetStore = (): void => {
    const liveStore = storeRef.deref();

    if (liveStore === undefined) {
      storeResets.delete(resetStore);

      return;
    }

    liveStore.setState(liveStore.getInitialState(), true);
  };

  storeResets.add(resetStore);
}

void mock.module('zustand/vanilla', () => ({ ...actualVanilla, createStore }));
