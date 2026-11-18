export { defineRig } from './config/define-rig.ts';
export { parseRigConfig } from './config/parse-rig-config.ts';
export type { ParsedRigConfig } from './config/parse-rig-config.ts';
export { runInPage } from './browser/run-in-page.ts';
export type { PageResultSchema } from './browser/run-in-page.ts';

export type {
  LaneContext,
  BenchDeclaration,
  LaneDeclaration,
  ProgramDeclaration,
  LaneStart,
  ResolvedLane,
  RigConfig,
  RigDeclaration,
} from './types.ts';
