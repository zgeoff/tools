import { expect, onTestFinished, test } from 'bun:test';
import { assign, createActor, createMachine, fromPromise, setup, waitFor } from 'xstate';
import type {
  EventObject,
  MachineContext,
  MachineTypes,
  MetaObject,
  ParameterizedObject,
  PromiseActorLogic,
  ProvidedActor,
  SetupTypes,
} from 'xstate';
import { machineTypes } from './machine-types.ts';
import type { MachineTypeKey } from './machine-types.ts';

type XStateTypeKey =
  | keyof SetupTypes<
      MachineContext,
      EventObject,
      Record<string, string>,
      string,
      unknown,
      unknown,
      EventObject,
      MetaObject
    >
  | keyof MachineTypes<
      MachineContext,
      EventObject,
      ProvidedActor,
      ParameterizedObject,
      ParameterizedObject,
      string,
      string,
      unknown,
      unknown,
      EventObject,
      MetaObject
    >;

interface Bell {
  readonly rings: number;
}

type BellEvent = { readonly type: 'ring' } | { readonly type: 'silence' };

test('it allows exactly the keys xstate reads from types', () => {
  const hasNoneMissing: [Exclude<XStateTypeKey, MachineTypeKey>] extends [never] ? true : false =
    true;

  const hasNoneExtra: [Exclude<MachineTypeKey, XStateTypeKey>] extends [never] ? true : false =
    true;

  expect({ hasNoneMissing, hasNoneExtra }).toStrictEqual({
    hasNoneMissing: true,
    hasNoneExtra: true,
  });
});

test('it refuses a key xstate does not read', () => {
  // @ts-expect-error -- `state` is not one of xstate's types keys
  const types = machineTypes<{ state: Bell }>();

  expect(types).toBeEmpty();
});

test('it types a machine with events only', () => {
  const machine = setup({ types: machineTypes<{ events: BellEvent }>() }).createMachine({
    initial: 'quiet',
    states: { quiet: { on: { ring: 'ringing' } }, ringing: { on: { silence: 'quiet' } } },
  });

  const actor = createActor(machine).start();

  onTestFinished(() => {
    actor.stop();
  });

  // @ts-expect-error -- the machine takes no `knock` event
  actor.send({ type: 'knock' });
  actor.send({ type: 'ring' });

  const context: MachineContext = actor.getSnapshot().context;

  expect({ value: actor.getSnapshot().value, context }).toStrictEqual({
    value: 'ringing',
    context: {},
  });
});

test('it types a machine with context and events', () => {
  const machine = setup({
    types: machineTypes<{ context: Bell; events: BellEvent }>(),
  }).createMachine({
    context: { rings: 0 },
    on: { ring: { actions: assign({ rings: (args) => args.context.rings + 1 }) } },
  });

  const actor = createActor(machine).start();

  onTestFinished(() => {
    actor.stop();
  });

  actor.send({ type: 'ring' });

  const rings: number = actor.getSnapshot().context.rings;

  // @ts-expect-error -- the context holds no `volume`
  const volume: unknown = actor.getSnapshot().context.volume;

  expect({ rings, volume }).toStrictEqual({ rings: 1, volume: undefined });
});

test('it types a machine with context, events and input', () => {
  const machine = setup({
    types: machineTypes<{ context: Bell; events: BellEvent; input: { readonly start: number } }>(),
  }).createMachine({
    context: (args) => ({ rings: args.input.start }),
    on: { ring: { actions: assign({ rings: (args) => args.context.rings + 1 }) } },
  });

  const actor = createActor(machine, { input: { start: 4 } }).start();

  onTestFinished(() => {
    actor.stop();
  });

  // @ts-expect-error -- the input's `start` is a number
  const misfit = createActor(machine, { input: { start: 'four' } });

  actor.send({ type: 'ring' });

  expect(actor.getSnapshot().context.rings).toBe(5);
  expect(misfit.id).toBeString();
});

test('it types a machine with actors that setup provides', async () => {
  const machine = setup({
    types: machineTypes<{ context: Bell; events: BellEvent }>(),
    actors: { countRings: fromPromise(() => Promise.resolve(3)) },
  }).createMachine({
    context: { rings: 0 },
    initial: 'counting',
    states: {
      counting: {
        invoke: {
          // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate's invoke config names the actor under `src`
          src: 'countRings',
          onDone: {
            target: 'counted',
            actions: assign({ rings: (args) => args.event.output }),
          },
        },
      },
      counted: {},
    },
  });

  const actor = createActor(machine).start();

  onTestFinished(() => {
    actor.stop();
  });

  const snapshot = await waitFor(actor, (state) => state.matches('counted'));

  expect(snapshot.context.rings).toBe(3);
});

test('it types a machine with actors declared in its types', async () => {
  const machine = createMachine({
    types: machineTypes<{
      context: Bell;
      events: BellEvent;
      // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate's actor type names the actor under `src`
      actors: { src: 'countRings'; logic: PromiseActorLogic<number> };
    }>(),
    context: { rings: 0 },
    initial: 'counting',
    states: {
      counting: {
        invoke: {
          // oxlint-disable-next-line zgeoff/no-abbreviated-names -- xstate's invoke config names the actor under `src`
          src: 'countRings',
          onDone: {
            target: 'counted',

            // createMachine types a declared actor's done output as any
            actions: assign({ rings: (args) => Number(args.event.output) }),
          },
        },
      },
      counted: {},
    },
  }).provide({ actors: { countRings: fromPromise(() => Promise.resolve(3)) } });

  const wordLogic = fromPromise(() => Promise.resolve('three'));

  // @ts-expect-error -- the declared actor's logic resolves to a number
  const misfit = machine.provide({ actors: { countRings: wordLogic } });
  const actor = createActor(machine).start();

  onTestFinished(() => {
    actor.stop();
  });

  const snapshot = await waitFor(actor, (state) => state.matches('counted'));

  expect(snapshot.context.rings).toBe(3);
  expect(misfit.id).toBeString();
});
