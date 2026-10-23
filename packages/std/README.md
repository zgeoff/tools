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

Each typed helper holds the one type assertion that its job needs, because TypeScript cannot prove
the type it returns. `toExactOptional` holds one for the same reason. The assertion carries an
approved disable comment, so code that calls the helper needs no assertion of its own.

The typed helpers are `machineTypes`, `pick`, `mergeDeep`, `toTagged` and `toReadonlyDeep`.

## Documentation

[The std typed helpers doc](../../docs/architecture/std-typed-helpers.md) describes each typed
helper, with an example.
