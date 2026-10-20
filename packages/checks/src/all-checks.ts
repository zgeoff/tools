import { commitsCheck } from './checks/commits-check.ts';
import { localPathsCheck } from './checks/local-paths-check.ts';
import { shellCheck } from './checks/shell-check.ts';
import { workflowsCheck } from './checks/workflows-check.ts';
import type { Check } from './types.ts';

export const allChecks: readonly Check[] = [
  shellCheck,
  workflowsCheck,
  commitsCheck,
  localPathsCheck,
];
