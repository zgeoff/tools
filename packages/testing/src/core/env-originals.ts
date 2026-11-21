// The original value of each variable that updateEnv has overridden, or undefined when it was
// unset. A variable is recorded the first time its name is overridden.
export const envOriginals = new Map<string, string | undefined>();
