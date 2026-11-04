# std file lock

`withFileLock`, from `@zgeoff/std/with-file-lock`, runs a callback while this process holds an
exclusive `flock` on a file. The [std README](../../packages/std/README.md#withfilelock) gives its
API.

## What callers rely on

- The kernel drops a `flock` when the holder's last descriptor closes, a crash or a `SIGKILL`
  included. Nothing judges a lock stale, and no caller removes another caller's lock.
- The file opens with close-on-exec, so a process that the callback starts does not keep the lock
  after the callback ends.
- Each call opens the file on its own, so a second call in the same process waits like a call from
  another process.
- The helper never removes the lock file. A caller that opened it before a removal would lock the
  removed file while a later caller locks a new file at the same path, and both would run.
- The holder writes its pid, host and a random token into the file. A crashed holder leaves its
  record until the next holder overwrites it, so read the record as a hint for a message, never as
  the lock's state.

## Limits

- Bun only, on Linux or macOS. CI runs on Linux, so the macOS libc path is checked by hand.
- A `flock` on a network file system, such as NFS, may not reach other hosts.
- The lock is exclusive. A caller that needs a shared lock keeps its own `flock`.
