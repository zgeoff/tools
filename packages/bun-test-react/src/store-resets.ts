// Both preloads resolve this module to one instance, so the set is shared without a global.
export const storeResets = new Set<() => void>();
