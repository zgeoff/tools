# @zgeoff/release-manifest

A release manifest is a small JSON file, `release.json`, that a repo attaches to each of its GitHub
releases to list what the release ships: its container images pinned by digest, the database
migrations it adds, and the config schema it expects. A repo that wants cloud to deploy it, such as
nixie, impz or atc, must publish one with each release. Cloud, the deployment repo, reads it,
because cloud deploys only released artifacts and takes those facts from the manifest in place of
each repo's source tree. This package holds the JSON Schema for the manifest, so each publishing
repo validates its manifest before upload and cloud validates it again after download, against the
same shape.

## Example

A release that runs two images and adds one migration publishes this `release.json`:

```json
{
  "format": 1,
  "version": "3.4.0",
  "tag": "v3.4.0",
  "commit": "4f2c9a1e8b7d6c5a4f3e2d1c0b9a8f7e6d5c4b3a",
  "images": {
    "api": "registry.example.com/shop/api:3.4.0@sha256:9b2e7c4a1d8f3e6b5a0c9d2e7f4a1b8c3d6e5f0a9b2c7d4e1f8a3b6c5d0e9f2a",
    "worker": "registry.example.com/shop/worker:3.4.0@sha256:1a6d3f8c2e9b4a7d0c5f2e8b1a4d7c0f3e6b9a2d5c8f1e4b7a0d3c6f9e2b5a8d"
  },
  "migrations": {
    "since": "v3.3.1",
    "added": [{ "version": 42, "name": "add_order_notes" }],
    "readableByReleaseBefore": true
  }
}
```

## Install

```sh
bun add -d @zgeoff/release-manifest ajv
```

## Usage

The schema is draft 2020-12 and uses no `format` keyword, so any validator for that draft gives the
same result. With Ajv:

```ts
import schema from '@zgeoff/release-manifest' with { type: 'json' };
import { Ajv2020 } from 'ajv/dist/2020.js';

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
- `configSchema` holds the file name of the config schema among the release's assets and lists its
  breaking changes.

The schema rejects a field that it does not name, so a new section starts as a change to this
package.
