// oxlint-disable zgeoff/file-named-for-export -- the JSX transform names this entry point
// Bun's development transform calls jsxDEV with the source position, which the tree does not keep.
export { Fragment, jsx, jsx as jsxDEV, jsxs } from './jsx-runtime.ts';
export type { JSX } from './jsx-runtime.ts';
