import { readStubCalls } from '@zgeoff/testing/bin';

export interface RigCall {
  readonly argv: readonly string[];

  // True when the call ran under the stub diet.
  readonly isUnderDiet: boolean;
}

// The calls that the stub rig of createChexBaselineRepo got, in call order, out of the stub folder
// that holds its record.
export function readRigCalls(binDirectory: string): readonly RigCall[] {
  return readStubCalls(binDirectory)
    .filter((call) => call.name === 'rig')
    .map((call) => ({ argv: call.argv, isUnderDiet: call.env['CHEX_STUB_UNDER_DIET'] === '1' }));
}
