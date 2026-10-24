// each limit is the per-test timeout in ms that the testing skill's Lanes table states
const standardLaneLimits = [
  ['browser', 10_000],
  ['e2e', 15_000],
  ['docker', 15_000],
  ['host', 15_000],
  ['agent-sdk', 5000],
  ['model-api', 120_000],
];

// the array form of the option names lanes without limits, and each gets the limit of the
// standard lanes that run a real system
const listedLaneLimitMs = 15_000;

export default function buildLaneLimits(lanes) {
  const limits = new Map(standardLaneLimits);

  if (Array.isArray(lanes)) {
    for (const lane of lanes) {
      if (!limits.has(lane)) {
        limits.set(lane, listedLaneLimitMs);
      }
    }
  } else if (lanes !== undefined) {
    for (const [lane, limitMs] of Object.entries(lanes)) {
      limits.set(lane, limitMs);
    }
  }

  return limits;
}
