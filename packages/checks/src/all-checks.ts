import { shellCheck } from './checks/shell-check.ts';
import type { Check } from './types.ts';

// Every check the runner knows, in the order it runs them.
export const allChecks: readonly Check[] = [shellCheck];
