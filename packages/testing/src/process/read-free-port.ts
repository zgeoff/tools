import { createServer } from 'node:net';

// Asks the OS for a free port on the loopback address. Another process can take the port before
// the program binds it.
export function readFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', reject);

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      server.close(() => {
        if (address !== null && typeof address === 'object') {
          resolve(address.port);
        } else {
          reject(new Error('the OS gave no port'));
        }
      });
    });
  });
}
