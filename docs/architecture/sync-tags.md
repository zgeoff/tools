# Sync tags

A sync tag marks the version of the shared files that a downstream repo syncs. A downstream repo
calls the repo-sync workflow at a sync tag, never at `main`, and each run syncs the files that tag
holds. A change merged in tools reaches a repo only when the repo moves to a newer tag, so a sweep
of test or doc audits never sees the shared files change under it. A delivered workflow that calls a
workflow in tools, such as `workflow-bun-pr`, runs at the same tag.

The tags count up from `sync-v1`, and each one marks a commit on `main`.
[Releasing the sync files](../runbooks/releasing-sync-files.md) gives the steps to push a new tag
and move each repo to it.

A tag is never moved or deleted, because the repos that pin it read it on every run.
