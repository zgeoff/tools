export function toQueryRows<R>(rows: readonly unknown[]): R[] {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- approved GEO-1460: Kysely's driver interface makes every driver claim that untyped rows are R
  return rows as R[];
}
