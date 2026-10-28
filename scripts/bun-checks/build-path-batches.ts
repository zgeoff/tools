// Splits the paths into batches whose argument bytes stay within the limit, as xargs does, so no
// command line outgrows what the kernel accepts. A path longer than the limit gets a batch alone.
export function buildPathBatches(paths: readonly string[], limitBytes: number): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let batchBytes = 0;

  for (const path of paths) {
    // Each argument also takes its terminating NUL.
    const pathBytes = Buffer.byteLength(path) + 1;

    if (batch.length > 0 && batchBytes + pathBytes > limitBytes) {
      batches.push(batch);

      batch = [];
      batchBytes = 0;
    }

    batch.push(path);

    batchBytes += pathBytes;
  }

  return batch.length > 0 ? [...batches, batch] : batches;
}
