#!/usr/bin/env bash
# The repo-sync step scripts of an older tools pin run this path from the commit
# they sync, so it runs the script under src/ with the same arguments.
exec bash "$(dirname "${BASH_SOURCE[0]}")/src/remove-excluded-blocks.sh" "$@"
