// The filesystem effects a step script reaches, which its CLI passes in as the real ones.
export interface FileSystem {
  readonly readText: (path: string) => Promise<string>;
  readonly readBytes: (path: string) => Promise<Uint8Array>;
  readonly readDirectory: (path: string) => Promise<string[]>;

  // Writes the text in place of the file's contents, and creates its folders first.
  readonly writeText: (path: string, text: string) => Promise<void>;
  readonly appendText: (path: string, text: string) => Promise<void>;
  readonly createDirectory: (path: string) => Promise<void>;

  // Removes a file or a folder with all it holds; a missing path is no error.
  readonly removePath: (path: string) => Promise<void>;
  readonly probePath: (path: string) => Promise<boolean>;
}
