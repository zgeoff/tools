# The Socket config

The Socket GitHub app checks pull requests for supply-chain risks in their dependencies, and reports
the result as the `Socket Security: Pull Request Alerts` check. The `socket` entry delivers
[`socket.yml`](../../socket.yml) to the repo root, the only place Socket reads it. The account stays
on Socket's Free plan, whose monthly scan cap is smaller than the number of pushes these repos make,
so the config limits the scans in two ways:

- `triggerPaths` lists the dependency manifests, the lock files and the workflow files, so a pull
  request that changes none of them gets no alert scan.
- `projectReportsEnabled: false` turns off the `Socket Security: Project Report` check.
  `triggerPaths` does not gate that check, which scans every push to every branch, the default
  branch included.

The alert check is advisory: no ruleset requires it, and the config leaves the app's comments on.
Renovate's pull requests are scanned like any other, because they are the pull requests that change
dependencies. [Dependency updates](./dependency-updates.md) describes how those pull requests open.
