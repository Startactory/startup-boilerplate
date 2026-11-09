export type OtlpSignal = 'traces' | 'metrics' | 'logs';

export function otlpSignalUrl(endpoint: string, signal: OtlpSignal): string {
  return `${endpoint.replace(/\/+$/, '')}/v1/${signal}`;
}

function decodeHeaderValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseOtlpHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const entry of raw.split(',')) {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();
    if (key.length === 0 || value.length === 0) continue;
    headers[key] = decodeHeaderValue(value);
  }
  return headers;
}
