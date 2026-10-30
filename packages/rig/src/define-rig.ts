import { isCommandName } from './is-command-name.ts';
import { parseDuration } from './parse-duration.ts';
import { standardLanes } from './standard-lanes.ts';
import type { StandardLane } from './standard-lanes.ts';
import type { LaneDeclaration, ResolvedLane, RigConfig, RigDeclaration } from './types.ts';

const laneNamePattern = /^[a-z][a-z0-9-]*$/u;

// A config file is outside input, so a bad value throws an error that names the lane and the field.
export function defineRig(declaration: RigDeclaration): RigConfig {
  const declared = Object.entries(declaration.lanes ?? {});

  for (const [name] of declared) {
    if (!laneNamePattern.test(name)) {
      throw new Error(
        `rig.config.ts: the lane name "${name}" must be lowercase letters, digits and dashes, starting with a letter`,
      );
    }

    if (isCommandName(name)) {
      throw new Error(
        `rig.config.ts: the lane name "${name}" is a rig command, so \`rig ${name}\` could never run the lane`,
      );
    }
  }

  const lanes = [
    ...standardLanes.map((standard) =>
      resolveStandardLane(standard, declaration.lanes?.[standard.name]),
    ),
    ...declared
      .filter(([name]) => !standardLanes.some((standard) => standard.name === name))
      .map(([name, laneDeclaration]) => resolveProjectLane(name, laneDeclaration)),
  ];

  assertDistinctSuffixes(lanes);

  return { lanes };
}

function resolveStandardLane(
  standard: StandardLane,
  declaration: LaneDeclaration | undefined,
): ResolvedLane {
  const declared = declaration ?? {};

  assertDirectoryLaneDeclaration(standard, declared);

  if (
    standard.name === 'browser' &&
    (declared.start !== undefined || declared.stop !== undefined)
  ) {
    throw new Error(
      'rig.config.ts: lane "browser" declares a start or a stop, but the browser lane has its hooks built in',
    );
  }

  return {
    name: standard.name,
    suffix:
      declared.suffix === undefined ? standard.suffix : readSuffix(standard.name, declared.suffix),
    limitMs:
      declared.limit === undefined ? standard.limitMs : readLimit(standard.name, declared.limit),
    parallel: standard.parallel,
    memory: readMemory(standard.name, declared.memory),
    start: readModulePath(standard.name, 'start', declared.start),
    stop: readModulePath(standard.name, 'stop', declared.stop),
  };
}

// The unit lane runs what the other lanes leave, and the e2e lane runs its directories, so
// neither has a suffix, and the unit run takes no limit or hooks of its own.
const directoryLaneFields = new Map<string, readonly (keyof LaneDeclaration)[]>([
  ['unit', ['suffix', 'limit', 'start', 'stop']],
  ['e2e', ['suffix']],
]);

function assertDirectoryLaneDeclaration(
  standard: StandardLane,
  declaration: LaneDeclaration,
): void {
  for (const field of directoryLaneFields.get(standard.name) ?? []) {
    if (declaration[field] !== undefined) {
      throw new Error(
        `rig.config.ts: lane "${standard.name}" declares ${field}, which the ${standard.name} lane does not take`,
      );
    }
  }
}

const suffixPattern = /^\.[a-z0-9][a-z0-9-]*$/u;

function readSuffix(lane: string, suffix: string): string {
  if (!suffixPattern.test(suffix)) {
    throw new Error(
      `rig.config.ts: lane "${lane}" has the suffix "${suffix}", which must be a dot and then lowercase letters, digits and dashes`,
    );
  }

  return suffix;
}

function readLimit(lane: string, limit: string): number {
  const limitMs = parseDuration(limit);

  if (limitMs === null) {
    throw new Error(
      `rig.config.ts: lane "${lane}" has the limit "${limit}", which is no duration such as '15s' or '1500ms'`,
    );
  }

  return limitMs;
}

const memoryPattern = /^[1-9]\d*[KMG]?$/u;

function readMemory(lane: string, memory: string | undefined): string | null {
  if (memory === undefined) {
    return null;
  }

  if (!memoryPattern.test(memory)) {
    throw new Error(
      `rig.config.ts: lane "${lane}" has the memory "${memory}", which is no budget such as '512M' or '8G'`,
    );
  }

  return memory;
}

function readModulePath(
  lane: string,
  field: 'start' | 'stop',
  path: string | undefined,
): string | null {
  if (path === undefined) {
    return null;
  }

  if (path === '' || path.startsWith('/')) {
    throw new Error(
      `rig.config.ts: lane "${lane}" has the ${field} "${path}", which must be a path relative to the repo root`,
    );
  }

  return path;
}

function resolveProjectLane(name: string, declaration: LaneDeclaration): ResolvedLane {
  if (declaration.limit === undefined) {
    throw new Error(`rig.config.ts: lane "${name}" needs a limit, such as '15s'`);
  }

  return {
    name,
    suffix: declaration.suffix === undefined ? `.${name}` : readSuffix(name, declaration.suffix),
    limitMs: readLimit(name, declaration.limit),
    parallel: 1,
    memory: readMemory(name, declaration.memory),
    start: readModulePath(name, 'start', declaration.start),
    stop: readModulePath(name, 'stop', declaration.stop),
  };
}

function assertDistinctSuffixes(lanes: readonly ResolvedLane[]): void {
  const owners = new Map<string, string>();

  for (const lane of lanes) {
    if (lane.suffix === null) {
      continue;
    }

    const owner = owners.get(lane.suffix);

    if (owner !== undefined) {
      throw new Error(
        `rig.config.ts: lanes "${owner}" and "${lane.name}" both use the suffix "${lane.suffix}"`,
      );
    }

    owners.set(lane.suffix, lane.name);
  }
}
