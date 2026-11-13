// A module that imports the polyfill beside an ES module, such as simplewebauthn,
// loads it too late in a bundle that wraps modules in lazy inits: Bun runs the
// ESM inits before the CommonJS require. Its own module makes it an ESM init.
// oxlint-disable-next-line import/no-unassigned-import -- the polyfill is a side effect
import 'reflect-metadata';
