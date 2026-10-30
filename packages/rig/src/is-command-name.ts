// The built-in commands that `rig` dispatches before it looks for a lane, so no lane may take one
// of these names.
export const commandNames = ['init', 'related'] as const;

export type CommandName = (typeof commandNames)[number];

export function isCommandName(name: string): name is CommandName {
  return commandNames.some((command) => command === name);
}
