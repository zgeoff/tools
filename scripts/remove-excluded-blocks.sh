#!/usr/bin/env bash
# The repo-sync step scripts run this path from the tools commit they sync, which
# can be older or newer than their pin, so it runs the script under src/ with the same arguments.
exec bash "$(dirname "${BASH_SOURCE[0]}")/src/remove-excluded-blocks.sh" "$@"
