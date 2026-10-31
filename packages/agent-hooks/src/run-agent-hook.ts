import { isRecord } from '@zgeoff/std';
import { match } from 'ts-pattern';
import type { Harness } from './harness.ts';
import { readProjectDir } from './read-project-dir.ts';
import { runSkillGate } from './skill-gate/run-skill-gate.ts';
import type { AgentHookHandler, HookResult, RepoContext } from './types.ts';

const HANDLERS: readonly AgentHookHandler[] = [runSkillGate];

export interface AgentHookOptions {
  readonly harness: Harness;
}

export async function runAgentHook(options: AgentHookOptions): Promise<never> {
  const payload: unknown = await Bun.stdin.json().catch(() => null);
  const projectDir = await readProjectDir(resolvePayloadCwd(payload));

  const context: RepoContext = { harness: options.harness, projectDir };

  const result = await runHandlers(HANDLERS, payload, context);

  return match(result)
    .with({ kind: 'block' }, (block) => {
      console.error(block.message);

      return process.exit(2);
    })
    .with({ kind: 'allow' }, (allow) => {
      if (allow.output !== undefined) {
        console.log(JSON.stringify(allow.output));
      }

      return process.exit(0);
    })
    .exhaustive();
}

function resolvePayloadCwd(payload: unknown): string {
  return isRecord(payload) && typeof payload['cwd'] === 'string' ? payload['cwd'] : process.cwd();
}

async function runHandlers(
  handlers: readonly AgentHookHandler[],
  payload: unknown,
  context: RepoContext,
): Promise<HookResult> {
  let output: object | undefined;

  for (const handler of handlers) {
    const result = await handler(payload, context);

    if (result.kind === 'block') {
      return result;
    }

    output ??= result.output;
  }

  return output === undefined ? { kind: 'allow' } : { kind: 'allow', output };
}
