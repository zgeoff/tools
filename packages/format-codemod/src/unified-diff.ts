function scanTo(lines: readonly string[], from: number, sentinel: string | undefined): number {
  let j = from;

  while (j < lines.length && lines[j] !== sentinel) {
    j++;
  }

  return j;
}

// Minimal line-based diff; enough to preview --dry output without a dep.
class LineDiff {
  private readonly a: readonly string[];

  private readonly b: readonly string[];

  private readonly out: string[];

  private i = 0;

  private k = 0;

  constructor(a: string, b: string, label: string) {
    this.a = a.split('\n');
    this.b = b.split('\n');
    this.out = [`--- ${label}\n`, `+++ ${label}\n`];
  }

  render(): string {
    while (this.i < this.a.length || this.k < this.b.length) {
      this.step();
    }

    return this.out.join('');
  }

  private step(): void {
    if (this.a[this.i] === this.b[this.k]) {
      this.i++;
      this.k++;
    } else {
      this.emitAdded();
      this.emitRemoved();
    }
  }

  private emitAdded(): void {
    const j = scanTo(this.b, this.k, this.a[this.i]);

    while (this.k < j) {
      this.out.push(`+${this.b[this.k]}\n`);
      this.k++;
    }
  }

  private emitRemoved(): void {
    const m = scanTo(this.a, this.i, this.b[this.k]);

    while (this.i < m) {
      this.out.push(`-${this.a[this.i]}\n`);
      this.i++;
    }
  }
}

export function unifiedDiff(a: string, b: string, label: string): string {
  return new LineDiff(a, b, label).render();
}
