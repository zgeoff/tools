export function pickQuantile(samples: readonly number[], quantile: number): number {
  const sorted = samples.toSorted((left, right) => left - right);
  const position = (sorted.length - 1) * quantile;
  const lower = Math.floor(position);
  const lowerSample = sorted[lower] ?? 0;
  const upperSample = sorted[Math.ceil(position)] ?? lowerSample;

  return lowerSample + (upperSample - lowerSample) * (position - lower);
}
