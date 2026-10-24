// The main preload and the zustand preload resolve this module to one instance, so the set is
// shared without a global.
export const storeResets = new Set<() => void>();
