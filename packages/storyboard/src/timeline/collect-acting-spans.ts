import type { ActingSpan, HostNode } from '../types.ts';
import type { ChangeRecord } from './types.ts';

interface CurrentHost {
  readonly host: HostNode<unknown>;
  readonly fromS: number;
}

// A host acts from a change that writes to it until a change writes to another host. A Beat's
// focus picks the acting host. The last host acts until the reset.
export function collectActingSpans(
  changes: readonly ChangeRecord[],
  timesMs: ReadonlyMap<ChangeRecord, number>,
  resetS: number,
): Map<HostNode<unknown>, ActingSpan[]> {
  const spans = new Map<HostNode<unknown>, ActingSpan[]>();

  let current: CurrentHost | undefined;

  for (const change of changes) {
    const next = pickActingHost(change);

    if (next === undefined || next === current?.host) {
      continue;
    }

    const atS = (timesMs.get(change) ?? 0) / 1000;

    if (current !== undefined) {
      appendSpan(spans, current.host, { fromS: current.fromS, toS: atS });
    }

    current = { host: next, fromS: atS };
  }

  if (current !== undefined) {
    appendSpan(spans, current.host, { fromS: current.fromS, toS: resetS });
  }

  return spans;
}

function pickActingHost(change: ChangeRecord): HostNode<unknown> | undefined {
  if (change.focus !== undefined) {
    return change.focus;
  }

  const written = new Set(
    change.parts.flatMap((part) => (part.host === undefined ? [] : [part.host])),
  );

  return written.size === 1 ? [...written][0] : undefined;
}

function appendSpan(
  spans: Map<HostNode<unknown>, ActingSpan[]>,
  host: HostNode<unknown>,
  span: ActingSpan,
): void {
  const list = spans.get(host) ?? [];

  list.push(span);
  spans.set(host, list);
}
