#!/usr/bin/env bash
# Starts main.yml at the tag of a release, so the publish run's commit is the tagged commit and
# npm provenance names it.
# Every package of one dispatch must share one release commit, or the run at the first tag would
# publish the others from the wrong commit; the script fails when they differ.
# Usage: dispatch-tag-publish.sh
# Env: RELEASE_OUTPUTS, the release-please outputs as JSON (paths_released, and <path>--sha and
#      <path>--tag_name for each released path);
#      GITHUB_REPOSITORY, the owner/repo;
#      GH_TOKEN, a token that may dispatch workflows.
set -euo pipefail

# release-please emits paths_released as a JSON-encoded string; accept a plain array too.
paths=$(jq -c '.paths_released | if type == "string" then fromjson else . end' <<< "$RELEASE_OUTPUTS")
shas=$(jq -r --argjson paths "$paths" \
  '[$paths[] as $p | .[$p + "--sha"] // "null"] | unique | join(" ")' <<< "$RELEASE_OUTPUTS")

if [ -z "$shas" ] || [ "$shas" = null ] || [ "${shas#* }" != "$shas" ]; then
  echo "::error::expected one release commit, got: $shas"
  exit 1
fi

tag=$(jq -r --argjson paths "$paths" '.[$paths[0] + "--tag_name"]' <<< "$RELEASE_OUTPUTS")

gh workflow run main.yml --repo "$GITHUB_REPOSITORY" --ref "$tag" -f republish_paths="$paths"
