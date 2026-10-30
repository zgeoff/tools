import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { BrowserRun } from './build-browser-run.ts';

export interface ChromeDirs {
  readonly privateDir: string;

  readonly runsDir: string;

  readonly runDir: string;
}

// Chrome binds its singleton socket at <TMPDIR>/org.chromium.Chromium.XXXXXX/SingletonSocket and
// stops at startup when that path passes the 107 bytes a Unix socket address holds.
const socketPathMaxBytes = 107;
const socketSuffix = '/org.chromium.Chromium.XXXXXX/SingletonSocket';

// Every user of a host shares /tmp, so each user's runs get a parent folder of their own. Each
// repo and host name gets a folder inside it, so a sweep reads only the runs it can probe.
export function pickChromeDirs(tmpdir: string, userID: number, run: BrowserRun): ChromeDirs {
  const privateName = `browser-lane-chrome-${userID}`;
  const runsKey = createHash('sha256').update(run.runsDir).digest('hex').slice(0, 8);
  const preferred = buildChromeDirs(join(tmpdir, privateName), runsKey, run.runID);

  return Buffer.byteLength(`${preferred.runDir}${socketSuffix}`) <= socketPathMaxBytes
    ? preferred
    : buildChromeDirs(join('/tmp', privateName), runsKey, run.runID);
}

function buildChromeDirs(privateDir: string, runsKey: string, runID: string): ChromeDirs {
  const runsDir = join(privateDir, runsKey);

  return { privateDir, runsDir, runDir: join(runsDir, runID) };
}
