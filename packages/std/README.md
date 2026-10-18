# @zgeoff/std

Small, dependency-free TypeScript helpers that more than one zgeoff repo needs. Each helper is one
file with its test beside it, exported from the package root, and named by the shared function-verb
rules.

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
