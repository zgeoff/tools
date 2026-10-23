# std typed helpers

The typed helpers are the helpers in `@zgeoff/std` that each hold the one type assertion that their
job needs, as the [Typed helpers](../../packages/std/README.md#typed-helpers) section of the package
README states.

## `machineTypes`

Returns the `types` value of an xstate `setup()` or `createMachine()` call. xstate reads `types`
only at compile time, and its documentation fills it with `{} as X`. The type argument names only
the keys xstate reads from `types`, such as `context`, `events`, `input` and `actors`, so a key
outside that set fails the type check. A key left out keeps xstate's default.

```ts
import { machineTypes } from '@zgeoff/std';
import { setup } from 'xstate';

const doorMachine = setup({
  types: machineTypes<{ context: { opens: number }; events: { type: 'open' } }>(),
}).createMachine({ context: { opens: 0 } });
```

## `pick`

Returns a copy of an object with only the listed keys, typed as `Pick<T, K>`. A listed key that the
object lacks stays out of the copy, so an optional key never holds an explicit `undefined`.

```ts
import { pick } from '@zgeoff/std';

const summary = pick(order, ['id', 'total']);
```

## `mergeDeep`

Merges a deep partial of an object over the whole object and returns a new object of the same type.
A plain object in the patch merges key by key over an object in the base, at the root or nested, and
the result keeps the base object's prototype, so a class instance stays one. An array, a function, a
`Date`, a `RegExp`, a `Map`, a `Set` or a `Promise` replaces the base value whole. The base and the
patch stay untouched. The `PartialDeep<T>` type describes the patch.

```ts
import { mergeDeep } from '@zgeoff/std';

const settings = mergeDeep(defaultSettings, { theme: { size: 14 } });
```

## `toTagged`

Returns a string, number or bigint typed as a tagged type, such as type-fest's
`Tagged<string, 'OrderID'>`. It takes the untagged base type and refuses a type that carries no tag,
such as a literal union, so it never narrows a value to a set of literals.

```ts
import { toTagged } from '@zgeoff/std';
import type { Tagged } from 'type-fest';

type OrderID = Tagged<string, 'OrderID'>;

const orderID = toTagged<OrderID>(crypto.randomUUID());
```

## `toReadonlyDeep`

Returns a value unchanged, typed as `ReadonlyDeep<T>`: every nested key readonly, an array as a
readonly array, a `Map` as a `ReadonlyMap` and a `Set` as a `ReadonlySet`. It freezes nothing at run
time. A function, a `Date`, a `RegExp` and a `Promise` keep their own type.

```ts
import { toReadonlyDeep } from '@zgeoff/std';

const config = toReadonlyDeep(parseConfig(text));
```
