// bun:sqlite binds a value outside this type, such as a Date, a plain object or
// undefined, as NULL without an error
export type SQLQueryBinding = string | bigint | number | boolean | null | NodeJS.TypedArray;

export function isSQLQueryBinding(value: unknown): value is SQLQueryBinding {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'bigint' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    (ArrayBuffer.isView(value) && !(value instanceof DataView))
  );
}
