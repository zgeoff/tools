# @zgeoff/bun-test-react

`bun test` preloads for React client code: a [happy-dom](https://github.com/capricorn86/happy-dom)
document that keeps Bun's own fetch stack, the
[jest-dom](https://github.com/testing-library/jest-dom) matchers, and a clean slate after each test
— every rendered tree unmounted, then every zustand store back at its initial state.

## Usage

```sh
bun add -d @zgeoff/bun-test-react @testing-library/react react react-dom
```

```toml
# bunfig.toml — order matters: the zustand preload must wrap `createStore` before any store exists
[test]
preload = [
  "@zgeoff/bun-test-extended",
  "@zgeoff/bun-test-react/zustand",
  "@zgeoff/bun-test-react",
]
```

```jsonc
// tsconfig.json — loads the jest-dom matcher types; the DOM libs come from @zgeoff/tsconfig/react.json
{ "compilerOptions": { "types": ["bun", "@zgeoff/bun-test-extended", "@zgeoff/bun-test-react"] } }
```

Leave out the `zustand` preload in a repo without zustand.

## Why each piece is there

- happy-dom replaces the fetch globals with its own, and Bun's `ReadableStream.pipeTo` and `fetch`
  reject them. The preload restores Bun's fetch stack after registering happy-dom.
- `@testing-library/dom` binds `screen` to the `document` it finds when it loads, so the preload
  loads jest-dom and `@testing-library/react` only after happy-dom exists.
- A failing matcher prints a DOM node as its opening tag, not as happy-dom's whole object graph.
- Trees unmount before the store reset: a reset under a mounted tree re-renders it, and its effects
  write the old test's state back.
