# Pre-push baseline

This folder holds the sources of the lefthook pre-push baseline, which the `pre-push-baseline` entry
of repo-sync delivers to a repo's `.lefthook/` and `scripts/` folders, and the memory-cap script,
which the `memory-cap` entry delivers. The baseline runs the checks that fit a small host before a
push: the files a branch changes, the unit tests beside them, and a whole-tree type check, each
under a memory cap. CI runs every whole-tree check and every lane.

## Memory budgets

Each run keeps its peak anonymous memory, as the memory-cap script measures it, within the budget of
its host. A run over its budget fails alone instead of taking the host down with it.

- A 2 GiB host: one pre-push job, its database included, within 1.2 GB.
- A shared workstation: one pre-push job within 2 GB, and one full test suite within 4 GB.
- CI: one full test suite within 8 GB.

## Documentation

- [The pre-push baseline](../../docs/architecture/pre-push-baseline.md): what the baseline runs,
  which tests the hook picks, and the timeout it raises on a host with one worker.
- [Memory caps](../../docs/architecture/memory-caps.md): the memory-cap script and the worker-count
  helper.
