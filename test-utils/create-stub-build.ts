export interface StubBuild {
  readonly runBuild: () => Promise<number>;

  // Resolves once the lane starts the build.
  readonly started: Promise<void>;

  readonly finish: (exitCode: number) => void;
}

// A build the test finishes by hand.
export function createStubBuild(): StubBuild {
  const started = Promise.withResolvers<void>();
  const exit = Promise.withResolvers<number>();

  return {
    runBuild: () => {
      started.resolve();

      return exit.promise;
    },
    started: started.promise,
    finish: (exitCode) => {
      exit.resolve(exitCode);
    },
  };
}
