import { runProgram } from '../run-program.ts';
import type { Check, CheckContext, Finding } from '../types.ts';
import { parseActionlintOutput } from './parse-actionlint-output.ts';

// actionlint over each workflow file. GitHub reads workflows only from the top of
// .github/workflows, so the glob leaves out subfolders.
export const workflowsCheck: Check = {
  name: 'workflows',
  glob: '.github/workflows/*.{yml,yaml}',
  check: checkWorkflowFiles,
};

function checkWorkflowFiles(context: CheckContext): Finding[] {
  const result = runProgram('workflows', context, [
    'actionlint',
    '-no-color',
    '-format',
    '{{json .}}',
    '--',
    ...context.files,
  ]);

  return parseActionlintOutput(result);
}
