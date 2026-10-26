import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type StubGHEndpoint = 'prs' | 'heads' | 'mergeable';

export interface StubGH {
  writeResponses: (name: StubGHEndpoint, bodies: readonly unknown[]) => Promise<void>;
  readCalls: () => Promise<string[]>;
}

const script = `#!/usr/bin/env bash
dir=$(dirname "$0")
call="$*"
printf '%s\\n' "\${call%% -f query=*}" >> "$dir/calls.log"
take() {
  local file="$dir/$1" n total
  [ -f "$file" ] || { printf '%s\\n' "$2"; return; }
  n=$(cat "$file.n" 2>/dev/null || echo 0)
  total=$(wc -l < "$file")
  body=$(sed -n "$(( n < total ? n + 1 : total ))p" "$file")
  echo $((n + 1)) > "$file.n"
  [ "$body" != '"error"' ] || { echo "HTTP 502" >&2; exit 1; }
  printf '%s\\n' "$body"
}
case "$*" in
  "pr list "*) take prs '[]' ;;
  "api graphql -f owner=zgeoff -f name=tools -f ref=refs/heads/release-please--branches--"*" -f query="*)
    take heads '' ;;
  "pr view "*) take mergeable '{"mergeable":"MERGEABLE"}' ;;
  "pr merge "*) ;;
  "workflow run "*) ;;
  *) echo "unexpected gh call: $*" >&2; exit 1 ;;
esac
`;

export async function createStubGH(directory: string): Promise<StubGH> {
  await writeFile(join(directory, 'gh'), script);
  await chmod(join(directory, 'gh'), 0o755);
  await writeFile(join(directory, 'calls.log'), '');

  return {
    writeResponses: async (name, bodies) => {
      await writeFile(
        join(directory, name),
        bodies.map((body) => `${JSON.stringify(body)}\n`).join(''),
      );
    },
    readCalls: async () => {
      const log = await readFile(join(directory, 'calls.log'), 'utf8');

      return log.split('\n').filter(Boolean);
    },
  };
}
