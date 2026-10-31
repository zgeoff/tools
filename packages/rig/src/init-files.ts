export interface InitFiles {
  readonly readJSON: (path: string) => Promise<unknown>;

  readonly writeText: (path: string, text: string) => Promise<void>;

  readonly probeFile: (path: string) => Promise<boolean>;
}

export const initFiles: InitFiles = {
  readJSON: (path) => Bun.file(path).json(),
  writeText: async (path, text) => {
    await Bun.write(path, text);
  },
  probeFile: (path) => Bun.file(path).exists(),
};
