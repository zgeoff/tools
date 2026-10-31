# Setting up the browser lane

A repo that uses [`@zgeoff/rig`](../../packages/rig/README.md) gets a browser lane with no lane
script of its own: `rig browser` runs the repo's `.browser.test.ts` suites, each file in its own
process, against Chrome through `Bun.WebView`.
[How rig works](../architecture/rig.md#the-browser-lane) describes what the lane does for a run. The
[testing skill](../../sync/skills/testing/references/system-tests.md#browser-suites) holds the rules
for the suites themselves.

## Adopt the lane

1. Add the package: `bun add -d @zgeoff/rig`.
2. Write a suite named `<module>.browser.test.ts` beside its module. The suite opens its views with
   `new Bun.WebView({ backend: 'chrome' })`, and gets the Chrome that the lane's preload started.
3. Track the suite with git: `git add <module>.browser.test.ts`. `rig init` adds the browser lane's
   script only when git tracks a `.browser.test.ts` file.
4. Run `bunx rig init`. Expect `test:browser` as `rig browser` in the repo's `package.json`, and a
   starter `rig.config.ts` when the repo has none.
5. Run `bun run test:browser` and check that the run prints no error from the preload.

## Build what the suites load

Define a `build:browser` script in `package.json` when the suites load a build, such as a web
client. The lane runs it once for the run, with the folder to write in `RIG_BROWSER_BUILD_DIR`. A
suite reads the same variable to find the build.

## Run page code

Page code longer than one line goes through `runInPage`, which `@zgeoff/rig` exports. It takes the
view, a real function, one JSON argument, and a schema for the result:

```ts
const heading = await runInPage(
  view,
  (selector: string) => document.querySelector(selector)?.textContent ?? '',
  'h1',
  z.string(),
);
```

## Cap the lane's memory

The lane runs under `diet` with the host's memory budget. To set another budget, declare it in
`rig.config.ts`:

```ts
export default defineRig({ lanes: { browser: { memory: '8G' } } });
```

Never run the lane under `ulimit -v`: Chrome reserves more address space than it uses and stops
under that cap.
