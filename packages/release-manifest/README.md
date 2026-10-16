# @zgeoff/release-manifest

The JSON Schema for `release.json`, the manifest that a release publishes as a release asset. A
deployment reads the manifest in place of the repo's source tree, so each repo that publishes one
validates it against this schema before upload, and each reader validates it after download.

## Install

```sh
bun add -d @zgeoff/release-manifest ajv
```

## Usage

The schema is draft 2020-12 and uses no `format` keyword, so any validator for that draft gives the
same result. With Ajv:

```ts
import { Ajv2020 } from 'ajv/dist/2020.js';
import schema from '@zgeoff/release-manifest' with { type: 'json' };

const validate = new Ajv2020({ allErrors: true }).compile(schema);

if (!validate(manifest)) {
  throw new Error(`release.json is invalid: ${JSON.stringify(validate.errors)}`);
}
```

## Shape

Every manifest carries `format`, `version`, `tag` and `commit`. `format` is 1, and it rises only on
a change that a reader of the format before would misread. The other sections are optional, and a
release includes only the ones that apply to it:

- `images` and `sandboxImages` map a name to an image pinned by digest.
- `migrations` lists the database migrations that the release adds since the release before.
- `configSchema` names the config schema among the release's assets and its breaking changes.

The schema rejects a field that it does not name, so a new section starts as a change to this
package.
