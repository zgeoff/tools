// Tells whether a program can bind the port on the loopback address.
export function probePortBindable(port: number): boolean {
  try {
    Bun.listen({
      hostname: '127.0.0.1',
      port,
      socket: {
        data: () => {
          // The listener only checks the bind.
        },
      },
    }).stop(true);

    return true;
  } catch {
    return false;
  }
}
