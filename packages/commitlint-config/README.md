# @zgeoff/commitlint-config

Shared [commitlint](https://commitlint.js.org) rules: a Conventional Commit type from a fixed list,
a lower-case header of at most 72 characters with no full stop, and blank lines before the body and
the footer.

## Usage

```sh
bun add -d @zgeoff/commitlint-config @commitlint/cli
```

```js
// commitlint.config.js
export default { extends: ['@zgeoff/commitlint-config'] };
```

The allowed types are `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`,
`style` and `test`.
