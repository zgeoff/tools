import { isRecord } from '@zgeoff/std';
import type { LefthookOutcome } from './build-lefthook-extends.ts';
import { baselinePath } from './build-lefthook-extends.ts';
import { parseLefthookConfig } from './parse-lefthook-config.ts';

export const guardedHooks = ['pre-commit', 'pre-push'] as const;

// lefthook runs the repo's own jobs before an extended file's, and a piped hook stops at the first
// failure, so the guard goes first.
export function buildLefthookGuard(text: string): LefthookOutcome {
  let edited = text;

  for (const hook of guardedHooks) {
    const edit = buildHookEdit(edited, hook);

    if (edit.kind === 'refused') {
      return edit;
    }

    edited = edit.text;
  }

  return edited === text ? { kind: 'unchanged', text } : { kind: 'changed', text: edited };
}

type GuardedHook = (typeof guardedHooks)[number];

type HookEdit =
  | { readonly kind: 'guarded'; readonly text: string }
  | { readonly kind: 'refused'; readonly reason: string };

export const guardName = 'chex-baseline';

// lefthook drops an extends entry whose file is missing and prints nothing, so a checkout with no
// node_modules runs none of the baseline's jobs unless a job in the repo's own config fails.
const guardScript = [
  `if [ ! -f ${baselinePath} ]; then`,
  `  echo "${guardName}: ${baselinePath} is missing, so lefthook runs none of the chex baseline's jobs; run bun install, then try again"`,
  '  exit 1',
  'fi',
  '# {files}',
];

// lefthook 2.2.2 skips a job whose run substitutes no file when no file matches: a commit that
// stages none, or a push of another branch while the checked-out one has nothing to push. Every
// repo that takes the baseline has package.json, and the shell comment hides it from the check.
const guardFiles = 'echo package.json';
const guardJob = { name: guardName, files: guardFiles, run: `${guardScript.join('\n')}\n` };

function buildHookEdit(text: string, hook: GuardedHook): HookEdit {
  const config = parseLefthookConfig(text);

  if (config === undefined) {
    return { kind: 'refused', reason: 'lefthook.yml is not a YAML mapping' };
  }

  const hookConfig = config[hook];

  if (hookConfig === undefined) {
    const separator = text.endsWith('\n') ? '' : '\n';

    return checkHookEdit(
      config,
      hook,
      { jobs: [guardJob] },
      `${text}${separator}\n${hook}:\n  jobs:\n${formatGuardJob('    ')}`,
    );
  }

  const listedJobs = isRecord(hookConfig) ? hookConfig['jobs'] : undefined;

  if (!isRecord(hookConfig) || !Array.isArray(listedJobs)) {
    return refuseHook(hook);
  }

  const jobs: readonly unknown[] = listedJobs;
  const listed = jobs.find((job: unknown) => isRecord(job) && job['name'] === guardName);

  if (listed !== undefined) {
    return Bun.deepEquals(listed, guardJob, true)
      ? { kind: 'guarded', text }
      : {
          kind: 'refused',
          reason: `lefthook.yml has a ${guardName} job under ${hook} that differs from the one chex init writes; remove it, then run chex init again`,
        };
  }

  const insert = findGuardInsert(text, hook);

  if (insert === undefined) {
    return refuseHook(hook);
  }

  return checkHookEdit(
    config,
    hook,
    { ...hookConfig, jobs: [guardJob, ...jobs] },
    `${text.slice(0, insert.offset)}${formatGuardJob(insert.indent)}${text.slice(insert.offset)}`,
  );
}

// A job list that the text lays out in a form the line search misreads, such as a flow list or a
// key in quotes, parses to something else once the guard lines go in.
function checkHookEdit(
  config: Record<string, unknown>,
  hook: GuardedHook,
  hookConfig: Record<string, unknown>,
  edited: string,
): HookEdit {
  const editedConfig = parseLefthookConfig(edited);

  if (
    editedConfig !== undefined &&
    Bun.deepEquals(editedConfig, { ...config, [hook]: hookConfig }, true)
  ) {
    return { kind: 'guarded', text: edited };
  }

  return refuseHook(hook);
}

function refuseHook(hook: GuardedHook): HookEdit {
  return {
    kind: 'refused',
    reason: `lefthook.yml writes ${hook} in a form chex init does not edit; write its ${hook} jobs as a block list, then run chex init again`,
  };
}

function formatGuardJob(indent: string): string {
  const lines = [
    `- name: ${guardName}`,
    `  files: ${guardFiles}`,
    '  run: |',
    ...guardScript.map((line) => `    ${line}`),
  ];

  return lines.map((line) => `${indent}${line}\n`).join('');
}

interface GuardInsert {
  readonly offset: number;
  readonly indent: string;
}

function findGuardInsert(text: string, hook: GuardedHook): GuardInsert | undefined {
  const hookLine = new RegExp(`^${hook}:[ \\t]*(?:#.*)?$`, 'mu').exec(text);

  if (hookLine === null) {
    return undefined;
  }

  const blockStart = hookLine.index + hookLine[0].length;
  const blockEnd = /^[^\s#]/mu.exec(text.slice(blockStart + 1));
  const blockStop = blockEnd === null ? text.length : blockStart + 1 + blockEnd.index;
  const block = text.slice(blockStart, blockStop);
  const jobsLine = /^[ \t]+jobs:[ \t]*(?:#.*)?$/mu.exec(block);

  if (jobsLine === null) {
    return undefined;
  }

  const afterJobs = jobsLine.index + jobsLine[0].length;
  const item = /^(?<indent>[ \t]*)- /mu.exec(block.slice(afterJobs));

  if (item === null) {
    return undefined;
  }

  return { offset: blockStart + afterJobs + 1, indent: item.groups?.['indent'] ?? '' };
}
