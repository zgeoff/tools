# Docs checks config

Three docs checks fail a doc that is too long or reads as a session's working record. Two of them
read a `chex` key in the repo's `package.json`, and need `jq`.

```json
{
  "chex": {
    "docsLengthExceptions": [{ "path": "docs/design/queue.md", "reason": "one table of 200 rows" }],
    "trackerPrefixes": ["ABC"]
  }
}
```

## Doc length

`chex length` fails a file under `docs/` over its cap: 250 lines, or 300 under `runbooks/`. Split
the file at a concept boundary, move shapes into sketch files, and move working notes out of the
repo. To keep a file whole, list it in `docsLengthExceptions` with a reason. An entry with no reason
fails the run.

## Tracker IDs

`chex prose` fails a tracker ID in prose when `trackerPrefixes` lists its prefix: `ABC` matches
`ABC-123`. The rule is off with no prefixes, since a bare pattern also matches `UTF-8` and
`SHA-256`. Fenced code blocks and code spans are exempt. Name the work by what it does, and put the
ID in the pull request body or the private tracker.

## Working-record phrases

`chex prose` fails these phrases in a file under `docs/`, in any case: `you decided`,
`decided by you`, `an earlier copy`, `a default that you can change` and `waits for you`. State the
rule as it stands, for a reader who was not there. A decision record under `docs/decisions/` is
exempt, since it says who decided.
