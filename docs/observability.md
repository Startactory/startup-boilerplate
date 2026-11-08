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

## Local dev backends

Pick one; both are free, OSS, single-container.

### Phoenix (Arize) — simplest

```sh
docker run -p 6006:6006 arizephoenix/phoenix
```

In `.env`:

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:6006
```

UI at <http://localhost:6006>.

### Langfuse self-hosted — richer UI for GenAI workflows

```sh
git clone https://github.com/langfuse/langfuse.git
cd langfuse && docker compose up
```

Default OTLP endpoint after setup: `http://localhost:3000/api/public/otel`. Get API headers from Langfuse UI and put into `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic%20<base64>`.

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
