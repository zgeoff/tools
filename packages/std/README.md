# @zgeoff/std

Small, dependency-free TypeScript helpers that more than one zgeoff repo needs. Each helper is one
file with its test beside it, exported from the package root, and named by the shared
function-naming rules.

## Install

```sh
bun add @zgeoff/std
```

## Helpers

### `toExactOptional`

Returns a copy of an object without the keys whose value is `undefined`, typed so the copy fits a
type with optional properties under `exactOptionalPropertyTypes`. It replaces the conditional
spread, `...(x === undefined ? {} : { x })`, that such code otherwise writes per key.

```ts
import { toExactOptional } from '@zgeoff/std';

interface Options {
  label?: string;
  retries: number;
}

const label: string | undefined = readLabel();

// { label: string | undefined; retries: number } does not fit Options, but
// toExactOptional's { label?: string; retries: number } does.
const options: Options = toExactOptional({ label, retries: 3 });
```

Own enumerable keys are copied, symbols included, as an object spread would. `null` values stay,
falsy values such as `0` and `''` stay, and the input object is left untouched. A union input maps
member by member, so each member keeps its own keys.

### `isRecord`

Tells whether a value is a plain keyed object, and narrows it to `Record<string, unknown>`, so code
that reads parsed JSON can index it. An array or `null` is not a record.

```ts
import { isRecord } from '@zgeoff/std';

const parsed: unknown = JSON.parse(text);
const name = isRecord(parsed) ? parsed['name'] : undefined;
```

### `isOneOf`

Tells whether a value is one of a list of values, and narrows it to the list's element type, so a
string read from outside the program becomes a literal union without a cast. It compares with
`Array.prototype.includes`, so `NaN` matches `NaN`.

```ts
import { isOneOf } from '@zgeoff/std';

const sizes = ['small', 'large'] as const;

const size = isOneOf(input, sizes) ? input : 'small';
```

## Typed helpers

Each helper in this section holds the one type assertion that its job needs, because TypeScript
cannot prove the type it returns. `toExactOptional` holds one for the same reason. The assertion
carries an approved disable comment, so code that calls the helper needs no assertion of its own.

### `machineTypes`

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

### `pick`

Returns a copy of an object with only the listed keys, typed as `Pick<T, K>`. A listed key that the
object lacks stays out of the copy, so an optional key never holds an explicit `undefined`.

```ts
import { pick } from '@zgeoff/std';

const summary = pick(order, ['id', 'total']);
```

### `mergeDeep`

Merges a deep partial of an object over the whole object and returns a new object of the same type.
A nested plain object merges key by key. An array, a function, a `Date`, a `RegExp`, a `Map`, a
`Set` or a `Promise` in the patch replaces the base value whole. The base and the patch stay
untouched. The `PartialDeep<T>` type describes the patch.

```ts
import { mergeDeep } from '@zgeoff/std';

const settings = mergeDeep(defaultSettings, { theme: { size: 14 } });
```

### `toTagged`

Returns a string, number or bigint typed as a tagged type, such as type-fest's
`Tagged<string, 'OrderID'>`. It takes the untagged base type and refuses a type that carries no tag,
such as a literal union, so it never narrows a value to a set of literals.

```ts
import { toTagged } from '@zgeoff/std';
import type { Tagged } from 'type-fest';

type OrderID = Tagged<string, 'OrderID'>;

const orderID = toTagged<OrderID>(crypto.randomUUID());
```

### `toReadonlyDeep`

Returns a value unchanged, typed as `ReadonlyDeep<T>`: every nested key readonly, an array as a
readonly array, a `Map` as a `ReadonlyMap` and a `Set` as a `ReadonlySet`. It freezes nothing at run
time. A function, a `Date`, a `RegExp` and a `Promise` keep their own type.

```ts
import { toReadonlyDeep } from '@zgeoff/std';

const config = toReadonlyDeep(parseConfig(text));
```
