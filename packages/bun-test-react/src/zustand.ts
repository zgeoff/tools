import { mock } from 'bun:test';
import type { StateCreator } from 'zustand';
import { storeResets } from './store-resets.ts';

const actualZustand = await import('zustand');

// Captured before mock.module swaps the live `zustand` binding; calling actualZustand.create from
// inside the wrapper would recurse.
const actualCreate = actualZustand.create;

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- StateCreator carries mutable marker properties and has no readonly form
function createTrackedStore<T>(creator: StateCreator<T>) {
  const store = actualCreate(creator);
  const initialState = store.getInitialState();

  storeResets.add(() => {
    store.setState(initialState, true);
  });

  return store;
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- StateCreator carries mutable marker properties and has no readonly form
function createWithReset<T>(stateCreator?: StateCreator<T>) {
  return typeof stateCreator === 'function' ? createTrackedStore(stateCreator) : createTrackedStore;
}

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- mirrors zustand's overloaded generic `create`; call-compatible but structurally distinct
const create = createWithReset as typeof actualZustand.create;

// Swaps the live `zustand` binding, so every consumer imported after this preload gets the
// tracked `create`.
void mock.module('zustand', () => ({ ...actualZustand, create }));
