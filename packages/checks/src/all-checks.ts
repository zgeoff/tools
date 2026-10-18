import { shellCheck } from './checks/shell-check.ts';
import type { Check } from './types.ts';

export const allChecks: readonly Check[] = [shellCheck];
