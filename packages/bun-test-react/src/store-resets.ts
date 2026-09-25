// Filled by the zustand preload and drained by the main preload after each test. Both preloads
// resolve this module to one instance, so the set is shared without a global.
export const storeResets = new Set<() => void>();
