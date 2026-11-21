export interface RecordedRequest {
  readonly method: string;

  // The pathname and search.
  readonly path: string;

  readonly headers: Readonly<Record<string, string>>;

  readonly body: string;
}

export interface StubServer {
  // http://127.0.0.1:<port>, with no trailing slash.
  readonly url: string;

  // In arrival order.
  readonly requests: readonly RecordedRequest[];

  // Closes open connections too.
  readonly stop: () => Promise<void>;
}

export interface StartStubServerOptions {
  // 'test' stops the server after the test, as registerTestCleanup does. 'manual' leaves that to
  // the caller. 'test' when it is unset.
  readonly cleanup?: 'test' | 'manual';
}
