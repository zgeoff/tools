# Observability testing

Metrics, spans, error reports, and log lines are outputs with callers: dashboards, alerts, and the
person reading an incident. Tests read them back through in-memory or loopback receivers that the
test registers, and they run the real SDK, never a spy on it. Each receiver comes down in
`onTestFinished`, as the [testing skill](../SKILL.md#cleanup) requires.

## Metrics

A counter's suite has two tests:

1. `it records <metric> per <attribute>`: record the counter two or three times with distinct
   attributes, then read the points back through an in-memory metric reader registered in the test
   and assert each point's attributes and value.
2. `it stays inert without a registered meter provider`: call the record function with no provider
   registered and assert that it does not throw.

## Spans

Capture spans with OpenTelemetry's `InMemorySpanExporter` behind a `SimpleSpanProcessor`, registered
on a tracer provider in the test. Tear down in this order: `trace.disable()`, then
`await provider.shutdown()`. In the other order, the global registration outlives the provider and
leaks into every later test in the process.

```ts
const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });

provider.register();
onTestFinished(async () => {
  trace.disable();
  await provider.shutdown();
});
```

## Error reports

Assert error reporting against the real Sentry SDK. Initialise it with a well-formed fake DSN,
`disableDefaultIntegrations: true`, and a `beforeSend` that records the event and returns `null`, so
no event leaves the process. `waitFor` the recorder before asserting, because the SDK sends
asynchronously.

## Log lines

Give the logger an injected destination stream, `{ write: (line) => lines.push(line) }`. Parse each
captured line with `JSON.parse` and assert it with `toMatchObject`. Pair each such test with one
that logs below the configured level and asserts `toBeEmpty()` on the captured lines. Never spy on
the logger.

## Exporters

Test an exporter's success path against a loopback receiver: `Bun.serve({ port: 0 })` records each
request, the test points the exporter's endpoint at it through the env util, and `onTestFinished`
stops the server. Assert the request path, the headers, and a non-empty body.
