// The caller's runner downloads this file on its own, so it imports nothing.

export type CheckPart = 'all' | 'static' | 'test' | 'lane';

export interface CheckPlanRequest {
  // The caller's space-separated list; empty or whitespace means the standard list.
  readonly scripts: string;

  // The script names the repo's package.json defines.
  readonly defined: readonly string[];

  readonly part: CheckPart;

  // The lane a lane job runs; the other parts ignore it.
  readonly lane: string;
}

export type CheckPlan =
  | {
      readonly kind: 'planned';
      readonly notice: string | null;
      readonly scripts: readonly string[];
      readonly static: readonly string[];
      readonly test: readonly string[];
      readonly lanes: readonly string[];
    }
  | { readonly kind: 'missing'; readonly missing: readonly string[] };

export function planCheckScripts(request: CheckPlanRequest): CheckPlan {
  const defined = new Set(request.defined);

  const listed = request.scripts.split(/\s+/u).filter((name) => name !== '');
  const isStandard = listed.length === 0;
  const list = isStandard ? buildStandardList(defined) : listed;
  const missing = list.filter((name) => !defined.has(name));

  if (missing.length > 0) {
    return { kind: 'missing', missing };
  }

  const lanes = list.filter((name) => isLaneScript(name)).map((name) => name.slice('test:'.length));
  const tests = list.filter((name) => isTestScript(name) && !isLaneScript(name));
  const staticChecks = list.filter((name) => !isTestScript(name));

  const parts: Record<CheckPart, readonly string[]> = {
    all: [...staticChecks, ...tests, ...lanes.map((lane) => `test:${lane}`)],
    static: staticChecks,
    test: tests,
    lane: [`test:${request.lane}`],
  };

  return {
    kind: 'planned',
    notice:
      isStandard && !defined.has('check')
        ? 'check skipped, because package.json has no check script; add "check": "zgeoff-check" to run it.'
        : null,
    scripts: parts[request.part],
    static: staticChecks,
    test: tests,
    lanes,
  };
}

const laneNames = ['e2e', 'browser', 'docker', 'host'];

// The standard list runs check, and each lane, only when the repo defines the script, so a repo
// turns one on by adding it.
function buildStandardList(defined: ReadonlySet<string>): string[] {
  const optional = (name: string) => (defined.has(name) ? [name] : []);

  return [
    'audit',
    'deadcode',
    'format:check',
    'lint',
    ...optional('check'),
    'typecheck',
    'test',
    ...laneNames.flatMap((lane) => optional(`test:${lane}`)),
  ];
}

function isLaneScript(name: string): boolean {
  return laneNames.some((lane) => name === `test:${lane}`);
}

function isTestScript(name: string): boolean {
  return name === 'test' || name.startsWith('test:');
}
