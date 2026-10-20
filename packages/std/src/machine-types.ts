// The keys xstate reads from `types` in setup() and in createMachine().
export type MachineTypeKey =
  | 'context'
  | 'events'
  | 'children'
  | 'tags'
  | 'input'
  | 'output'
  | 'emitted'
  | 'meta'
  | 'transitionMeta'
  | 'actors'
  | 'actions'
  | 'guards'
  | 'delays';

type MachineTypeSpec = Partial<Readonly<Record<MachineTypeKey, unknown>>>;

export function machineTypes<
  T extends MachineTypeSpec & Record<Exclude<keyof T, MachineTypeKey>, never>,
>(): T {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- approved GEO-1460: xstate v5 documents only `{} as X` for setup({ types }), and reads the value only at compile time
  return {} as T;
}
