# @zgeoff/exact-optional

Private until its first publish to npm.

`toExactOptional` returns a copy of an object without the keys whose value is `undefined`, typed so
the copy fits a type with optional properties under `exactOptionalPropertyTypes`. It replaces the
conditional spread, `...(x === undefined ? {} : { x })`, that such code otherwise writes per key.

## Install

```sh
bun add @zgeoff/exact-optional
```

## Usage

```ts
import { toExactOptional } from '@zgeoff/exact-optional';

interface Options {
  label?: string;
  retries: number;
}

const label: string | undefined = readLabel();

// { label: string | undefined; retries: number } does not fit Options, but
// toExactOptional's { label?: string; retries: number } does.
const options: Options = toExactOptional({ label, retries: 3 });
```

Only own enumerable string keys are copied. `null` values stay, falsy values such as `0` and `''`
stay, and the input object is left untouched.
