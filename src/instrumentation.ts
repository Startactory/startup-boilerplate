import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';
import {
  otlpSignalUrl,
  parseOtlpHeaders,
} from '@/shared/telemetry/otlp-config';

const isDebugEnabled = process.env.OTEL_LOG_LEVEL === 'debug';

if (isDebugEnabled) {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;

  try {
    const { registerOTel } = await import('@vercel/otel');
    const { getNodeAutoInstrumentations } = await import(
      '@opentelemetry/auto-instrumentations-node'
    );
    const { OTLPMetricExporter } = await import(
      '@opentelemetry/exporter-metrics-otlp-http'
    );
    const { OTLPLogExporter } = await import(
      '@opentelemetry/exporter-logs-otlp-http'
    );
    const { PeriodicExportingMetricReader } = await import(
      '@opentelemetry/sdk-metrics'
    );
    const { BatchLogRecordProcessor } = await import('@opentelemetry/sdk-logs');

    const headers = process.env.OTEL_EXPORTER_OTLP_HEADERS;
    const parsedHeaders = headers ? parseOtlpHeaders(headers) : undefined;
    const exporterTimeoutMillis = 5000;

    const metricExporter = new OTLPMetricExporter({
      url: otlpSignalUrl(endpoint, 'metrics'),
      headers: parsedHeaders,
      timeoutMillis: exporterTimeoutMillis,
    });

    const logExporter = new OTLPLogExporter({
      url: otlpSignalUrl(endpoint, 'logs'),
      headers: parsedHeaders,
      timeoutMillis: exporterTimeoutMillis,
    });

    registerOTel({
      serviceName: process.env.OTEL_SERVICE_NAME ?? 'startup-boilerplate',
      attributes: {
        'service.version': process.env.OTEL_SERVICE_VERSION,
      },
      // No traceExporter: @vercel/otel already builds one from OTEL_EXPORTER_OTLP_*, and a second one exports every span twice.
      logRecordProcessors: [new BatchLogRecordProcessor(logExporter)],
      metricReaders: [
        new PeriodicExportingMetricReader({
          exporter: metricExporter,
          exportIntervalMillis: 60000,
          exportTimeoutMillis: exporterTimeoutMillis,
        }),
      ],
      instrumentations: [
        ...getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-dns': { enabled: false },
          '@opentelemetry/instrumentation-net': { enabled: false },
          '@opentelemetry/instrumentation-pino': { enabled: true },
        }),
      ],
    });
  } catch (error) {
    // shared/logger may not be initialized yet during OTel bootstrap; console is the safe fallback here.
    console.error('[instrumentation] OTel init failed:', error);
  }
}
