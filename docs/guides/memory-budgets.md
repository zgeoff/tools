# Memory budgets

Each run keeps its peak anonymous memory, as [`diet`](../architecture/memory-caps.md) measures it,
within the budget of its host. A run over its budget fails alone instead of taking the host down
with it. Size a test suite, a pre-push job and the fixtures they start to these budgets:

- A 2 GiB host: one pre-push job, its database included, within 1.2 GB.
- A shared workstation: one pre-push job within 2 GB, and one full test suite within 4 GB.
- CI: one full test suite within 8 GB.
