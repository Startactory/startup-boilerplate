# Observability

The app emits OpenTelemetry traces, metrics, and logs via the OTLP/HTTP exporter when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Bootstrap lives in `src/instrumentation.ts` (auto-loaded by Next.js).

## What gets traced

Automatic (via `@opentelemetry/auto-instrumentations-node`):
- Outgoing HTTP requests (Autumn, Resend, Upstash, …)
- PostgreSQL queries (Drizzle through `postgres-js`)
- Vercel runtime spans

Custom: wrap any operation worth tracing with the `withSpan` helper (see "Adding spans in new code" below).

## PII protection

Custom span attributes must never include user-provided content verbatim (free text, file contents, names, search queries). Only counts, sizes, IDs (UUIDs), durations, and error codes.

## Backend: Dash0

Logs, traces and metrics go to [Dash0](https://www.dash0.com) over OTLP/HTTP. Nothing in the code is Dash0-specific: any OTLP backend works with the same three variables.

```
OTEL_EXPORTER_OTLP_ENDPOINT=https://ingress.eu-west-1.aws.dash0.com
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer auth_<token>,Dash0-Dataset=<slug>
OTEL_SERVICE_NAME=<slug>
```

- **Endpoint** — Organization Settings → Endpoints → "OTLP via HTTP". Base URL only: no trailing slash, no `/v1/...`. The region is fixed when the Dash0 organization is created, so an EU startup needs an EU organization (see `.claude/skills/create-startup/references/data-region.md`).
- **Headers** — a token restricted to the startup's dataset, ingest only. Values may be written literally or percent-encoded (`Bearer%20auth_…`); both parse. The value is a secret: set it with `scripts/set-env-var.mjs`, which also validates its shape.
- **One organization, many startups** — each startup gets its own dataset (named after its slug) and its own token. Without `Dash0-Dataset`, data lands in the `default` dataset.
- **Cost** — Dash0 has no free tier (14-day trial, then billed per log record, span and metric data point). Sampling below keeps trace volume in check.

Leave `OTEL_EXPORTER_OTLP_ENDPOINT` empty to disable export entirely; logs still print to stdout (and to Vercel's runtime logs in production).

## How each signal is exported

| Signal | Exporter | Notes |
| --- | --- | --- |
| Logs | `OTLPLogExporter` (JSON), batched | Every `shared/logger` call goes through `@opentelemetry/instrumentation-pino`, so it reaches Dash0 with `trace_id` / `span_id` and links to its trace. |
| Traces | built by `@vercel/otel` from `OTEL_EXPORTER_OTLP_*` (protobuf) | Do not pass a `traceExporter` to `registerOTel`: `@vercel/otel` keeps its own env-based exporter anyway, so every span would be exported twice. |
| Metrics | `OTLPMetricExporter` (JSON), every 60 s | Node.js runtime and HTTP client metrics. |

On Vercel, a function can freeze before the last batch is flushed. Check after the first production deploy that recent logs reach Dash0. Dash0's Vercel integration (a log drain that also captures build and request logs) needs a Vercel Pro plan; on Hobby, the OTLP export above is the only path.

## Local backends without an account

To inspect telemetry offline, run Phoenix and point the endpoint at it:

```sh
docker run -p 6006:6006 arizephoenix/phoenix
```

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:6006
```

UI at <http://localhost:6006>.

## Production sampling

Default OTLP exporter sends 100% of traces. For production, set:

```
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1
```

= 10% sampling. Errors still go through if your backend supports tail-based on error attribute.

## Adding spans in new code

```ts
import { withSpan, addCurrentSpanAttributes } from '@/shared/telemetry/with-span';

const result = await withSpan({
  name: 'my.operation',
  attributes: { 'my.entity_id': id },
  fn: async () => {
    // ... do work
    addCurrentSpanAttributes({ 'my.result_count': items.length });
    return items;
  },
});
```

Never put user content into span attributes — only size/count/id attrs.
