# std file lock

`withFileLock`, from `@zgeoff/std/with-file-lock`, runs a callback while this process holds an
exclusive lock on a file, so the processes that share the file run the callback one at a time.

```ts
import { withFileLock } from '@zgeoff/std/with-file-lock';

const result = await withFileLock('build.lock', () => runBuild(), { waitMs: 30_000 });

if (result.kind === 'busy') {
  console.error(`pid ${result.holder?.pid ?? 'unknown'} still holds build.lock`);
}
```

## The lock

- The lock is a `flock(LOCK_EX | LOCK_NB)` on the file, which libc gives through `bun:ffi`. Node has
  no `flock` and no `bun:ffi`, so the helper has its own entry point, and the package root stays
  importable from Node and from a browser bundle.
- The kernel drops a `flock` when the holder's last descriptor closes, a crash or a `SIGKILL`
  included. A dead holder's lock is free at once, so no caller judges a lock stale, and no caller
  removes another caller's lock.
- The holder opens the file with close-on-exec, so a process that the callback starts does not keep
  the lock after the callback ends.
- Each call opens the file on its own, so a second call in the same process on the same file waits
  like a call from another process.
- The helper tries again until `waitMs` passes. `waitMs` defaults to 0, which tries once.
- A `flock` failure other than "held by another" throws, with its errno.

## The result

- `{ kind: 'ran', value }`: the callback ran under the lock, and `value` is what it resolved to.
- `{ kind: 'busy', holder }`: another holder kept the lock for all of `waitMs`.
- When the callback throws, the lock is let go and the error passes through.

The lock spans the callback exactly. Hold the lock for the whole operation by putting the whole
operation in the callback.

## The owner record

Once it holds the lock, the holder writes its `pid`, `host`, a random `token` and `acquiredAt` into
the file as JSON, and empties the file before it lets go. The token tells apart two holders that had
the same pid. A busy result's `holder` is that record, or `null` when the file is empty or holds a
partial record. A holder that crashed leaves its record, which the next holder overwrites, so read
the record as a hint for a message, never as the lock's state.

## The file stays

The helper never removes the lock file. A caller that opened the file before a removal would lock
the removed file while a later caller locks a new file at the same path, and both would run.

## Limits

- Bun only, on Linux or macOS. CI runs on Linux, so the macOS libc path is checked by hand.
- A `flock` on a network file system, such as NFS, may not reach other hosts.
- The lock is exclusive. A caller that needs a shared lock keeps its own `flock` for now.
