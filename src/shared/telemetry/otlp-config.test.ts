import { describe, expect, it } from 'vitest';
import { otlpSignalUrl, parseOtlpHeaders } from './otlp-config';

describe('parseOtlpHeaders — OTEL_EXPORTER_OTLP_HEADERS', () => {
  it('parses comma-separated key=value pairs', () => {
    expect(parseOtlpHeaders('a=1,b=2')).toEqual({ a: '1', b: '2' });
  });

  it('parses the Dash0 token and dataset headers', () => {
    expect(
      parseOtlpHeaders('Authorization=Bearer auth_abc,Dash0-Dataset=acme'),
    ).toEqual({ Authorization: 'Bearer auth_abc', 'Dash0-Dataset': 'acme' });
  });

  it('decodes percent-encoded values, as the OpenTelemetry spec requires', () => {
    expect(parseOtlpHeaders('Authorization=Bearer%20auth_abc')).toEqual({
      Authorization: 'Bearer auth_abc',
    });
  });

  it('keeps "=" inside a value', () => {
    expect(parseOtlpHeaders('Authorization=Basic dXNlcjpwYXNz==')).toEqual({
      Authorization: 'Basic dXNlcjpwYXNz==',
    });
  });

  it('keeps "+" and "/" from base64 tokens unchanged', () => {
    expect(parseOtlpHeaders('Authorization=Basic a+b/c')).toEqual({
      Authorization: 'Basic a+b/c',
    });
  });

  it('trims whitespace around keys and values', () => {
    expect(parseOtlpHeaders(' a = 1 , b=2 ')).toEqual({ a: '1', b: '2' });
  });

  it('skips empty and malformed entries', () => {
    expect(parseOtlpHeaders('a=1,,novalue,=orphan,b=')).toEqual({ a: '1' });
  });

  it('keeps the raw value when its percent-encoding is malformed', () => {
    expect(parseOtlpHeaders('a=100%')).toEqual({ a: '100%' });
  });

  it('returns an empty record for an empty string', () => {
    expect(parseOtlpHeaders('')).toEqual({});
  });
});

describe('otlpSignalUrl — per-signal OTLP/HTTP path', () => {
  it('appends the signal path to the base endpoint', () => {
    expect(
      otlpSignalUrl('https://ingress.eu-west-1.aws.dash0.com', 'logs'),
    ).toBe('https://ingress.eu-west-1.aws.dash0.com/v1/logs');
  });

  it('does not double the slash when the endpoint ends with one', () => {
    expect(
      otlpSignalUrl('https://ingress.eu-west-1.aws.dash0.com/', 'traces'),
    ).toBe('https://ingress.eu-west-1.aws.dash0.com/v1/traces');
  });

  it('keeps a port and a path prefix', () => {
    expect(otlpSignalUrl('http://localhost:4318/otel//', 'metrics')).toBe(
      'http://localhost:4318/otel/v1/metrics',
    );
  });
});
