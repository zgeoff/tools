# Releasing the sync files

A release of the sync files is a new [sync tag](../architecture/sync-tags.md) on `main`, which each
downstream repo then moves to. Run these steps from a tools checkout:

1. Tag the merged `main` with the next number, and push the tag:

   ```sh
   git fetch origin main
   git tag sync-v2 origin/main
   git push origin sync-v2
   ```

2. Renovate moves each downstream repo to the tag in a pull request that merges on green checks, and
   the merge starts the repo's sync run. To move a repo by hand instead,
   [`scripts/pin-tools-ref.sh`](../../scripts/pin-tools-ref.sh) rewrites every call to a workflow in
   tools in the repo's `.github/workflows/`, and prints each file it changed:

   ```sh
   bash scripts/pin-tools-ref.sh sync-v2 ../<repo>
   ```
