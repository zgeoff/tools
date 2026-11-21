import { registerTestCleanup } from '../core/register-test-cleanup.ts';
import { claimPortsElsewhere } from './claim-ports-elsewhere.ts';
import { claimPortsOnLinux } from './claim-ports-on-linux.ts';

export interface FreePorts {
  // The next claimed port. Throws once every port has been taken.
  readonly take: () => number;

  // Gives up every claim, taken or not.
  readonly release: () => void;
}

export interface ClaimFreePortsOptions {
  readonly cleanup?: 'test' | 'manual';
}

// Claims count free ports, and holds each one until release or the end of the test. A claim keeps
// out every other caller of this function, in any process on the host. A program that binds the
// port without this function can still take it.
export function claimFreePorts(count: number, options: ClaimFreePortsOptions = {}): FreePorts {
  const holds =
    process.platform === 'linux' ? claimPortsOnLinux(count) : claimPortsElsewhere(count);

  let taken = 0;

  const release = (): void => {
    for (const hold of holds) {
      hold.release();
    }
  };

  return {
    take: () => {
      const hold = holds[taken];

      if (hold === undefined) {
        throw new Error(`only ${holds.length} free ports were asked for`);
      }

      taken += 1;

      return hold.port;
    },
    release: options.cleanup === 'manual' ? release : registerTestCleanup(release),
  };
}
