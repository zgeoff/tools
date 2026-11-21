export function formatNumber(value: number): string {
  const text = String(Number(value.toFixed(2)));

  return text === '-0' ? '0' : text;
}

export function formatKeyTime(fraction: number): string {
  return fraction.toFixed(4);
}

export function formatPrecise(value: number): string {
  const text = String(Number(value.toFixed(4)));

  return text === '-0' ? '0' : text;
}
