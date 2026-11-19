#!/usr/bin/env bash
# Packs each released package with bun and publishes the tarball with npm, which can sign
# provenance where bun publish cannot (oven-sh/bun#15601). Run from the repo root, at the release
# tag, under npm trusted publishing.
# A rerun skips the versions npm holds already, and a private package. One failed package must not
# keep the rest from npm, so the loop keeps going and the script fails at the end.
# Usage: publish-npm-tarballs.sh
# Env: PATHS, a JSON array of the package folders, e.g. ["packages/std"].
set -euo pipefail

failed=0

for dir in $(jq -r '.[]' <<< "$PATHS"); do
  name=$(jq -r .name "$dir/package.json")
  version=$(jq -r .version "$dir/package.json")

  if [ "$(jq -r '.private // false' "$dir/package.json")" = true ]; then
    echo "skipping $name: private"
  elif [ "$(npm view "$name@$version" version 2> /dev/null)" = "$version" ]; then
    echo "skipping $name@$version: already published"
  else
    out=$(mktemp -d)
    (cd "$dir" && bun run --if-present build && bun pm pack --destination "$out" &&
      npm publish "$out"/*.tgz --provenance --access public) || {
      echo "::error::$name@$version failed to publish"
      failed=1
    }
  fi
done

exit "$failed"
