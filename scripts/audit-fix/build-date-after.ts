// Returns the ISO date the given number of days after an ISO date, in UTC.
export function buildDateAfter(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);

  result.setUTCDate(result.getUTCDate() + days);

  return result.toISOString().slice(0, 10);
}
