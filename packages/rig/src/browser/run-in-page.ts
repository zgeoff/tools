interface PageResultIssue {
  readonly message: string;

  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[] | undefined;
}

type PageResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: readonly PageResultIssue[] };

// The part of a Standard Schema (standardschema.dev) that the helper reads, so a zod, valibot or
// arktype schema parses the result with no dependency here.
export interface PageResultSchema<Input, Output> {
  readonly '~standard': {
    readonly validate: (value: unknown) => PageResult<Output> | Promise<PageResult<Output>>;

    readonly types?: { readonly input: Input; readonly output: Output } | undefined;
  };
}

// The function runs in the page, so it sees only its argument and the page's globals, and its
// result crosses back as JSON. The argument crosses as a JSON string that the page parses,
// because an object literal in the script reads some keys differently from JSON.
export async function runInPage<Argument, Input, Output>(
  view: Bun.WebView,
  pageFunction: (argument: Argument) => NoInfer<Input> | Promise<NoInfer<Input>>,
  argument: Argument,
  schema: PageResultSchema<Input, Output>,
): Promise<Output> {
  const source = pageFunction.toString();

  // The page reads the source as an expression, which a method or a bound function is not.
  if (!isFunctionExpression(source)) {
    throw new TypeError(
      'runInPage takes an arrow function or a function expression, never a method or a bound function',
    );
  }

  // JSON has no undefined, so an undefined argument reaches the page as no argument.
  const call =
    argument === undefined
      ? `(${source})()`
      : `(${source})(JSON.parse(${JSON.stringify(formatArgumentJSON(argument))}))`;

  const value: unknown = await view.evaluate(call);
  const result = await schema['~standard'].validate(value);

  if (result.issues !== undefined) {
    throw new Error(`the page's result fails its schema: ${formatIssues(result.issues)}`, {
      cause: result.issues,
    });
  }

  return result.value;
}

// The Transpiler starts on the first call, because this module loads under Node, which has no
// Bun global, when oxlint reads a repo's rig.config.ts.
function isFunctionExpression(source: string): boolean {
  const pageCodeTranspiler = new Bun.Transpiler({ loader: 'js' });

  try {
    pageCodeTranspiler.transformSync(`(${source});`);

    return true;
  } catch {
    return false;
  }
}

// JSON turns a Date into a string and a Map into an empty object, so an argument that JSON changes
// would reach the page as a value that its type does not describe.
function formatArgumentJSON(argument: unknown): string {
  const json: unknown = JSON.stringify(argument);

  if (typeof json !== 'string' || !isJSONUnchanged(json, argument)) {
    throw new TypeError('runInPage takes an argument that JSON carries to the page unchanged');
  }

  return json;
}

function isJSONUnchanged(json: string, argument: unknown): boolean {
  const parsed: unknown = JSON.parse(json);

  return Bun.deepEquals(parsed, argument);
}

function formatIssues(issues: readonly PageResultIssue[]): string {
  return issues
    .map((issue) => {
      const path = (issue.path ?? []).map((segment) => formatPathSegment(segment)).join('.');

      return path === '' ? issue.message : `${path}: ${issue.message}`;
    })
    .join('; ');
}

function formatPathSegment(segment: PropertyKey | { readonly key: PropertyKey }): string {
  const key = typeof segment === 'object' ? segment.key : segment;

  return String(key);
}
