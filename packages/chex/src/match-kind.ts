interface Kinded {
  readonly kind: string;
}

export type KindHandlers<Union extends Kinded, Result> = {
  readonly [Kind in Union['kind']]: (value: Extract<Union, { readonly kind: Kind }>) => Result;
};

// ts-pattern's exhaustive match does this, but a reusable workflow downloads the CLI and every file
// it imports with no install, so these files import no package. The handler type, keyed by every
// kind, fails the type check when a member of the union has no branch.
export function matchKind<Union extends Kinded, Result>(
  value: Union,
  handlers: KindHandlers<Union, Result>,
): Result;

export function matchKind(
  value: Kinded,
  handlers: Readonly<Record<string, (value: Kinded) => unknown>>,
): unknown {
  const handler = handlers[value.kind];

  if (handler === undefined) {
    throw new Error(`no branch handles the kind ${value.kind}`);
  }

  return handler(value);
}
