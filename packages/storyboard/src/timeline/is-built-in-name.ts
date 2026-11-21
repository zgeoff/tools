const BUILT_IN_NAME = /^(?:start|reset|stage\d+)$/u;

// The names of the built-in instants: `start`, `reset` and `stage<N>`.
export function isBuiltInName(name: string): boolean {
  return BUILT_IN_NAME.test(name);
}
