import { describe, expect, it, vi } from 'vitest';
import { provisionDash0 } from '../../scripts/providers/dash0-dataset.mjs';

const API = 'https://api.eu-west-1.aws.dash0.com';
const OTLP = 'https://ingress.eu-west-1.aws.dash0.com';
const ADMIN_TOKEN = 'auth_admin_secret_value';
const INGEST_TOKEN = 'auth_ingest_secret_value';

function fakeResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
  };
}

function setup({
  production = null,
  tokenExists = false,
  datasetStatus = 201,
}: {
  production?: Map<string, string> | null;
  tokenExists?: boolean;
  datasetStatus?: number;
} = {}) {
  const writeFields = vi.fn();
  const op = {
    readFields: vi.fn(({ vault }: { vault: string }) =>
      vault === 'startup-founder' ? new Map() : production,
    ),
    writeFields,
  };
  const calls: string[] = [];
  const fetch = vi.fn(async (url: string, init: { method: string }) => {
    calls.push(`${init.method} ${url.replace(API, '')}`);
    if (url.includes('/api/datasets/')) {
      return fakeResponse(datasetStatus, {});
    }
    if (init.method === 'GET') {
      return tokenExists ? fakeResponse(200, {}) : fakeResponse(404, null);
    }
    if (init.method === 'DELETE') return fakeResponse(200, {});
    return fakeResponse(201, { spec: { token: INGEST_TOKEN } });
  });
  const syncEnv = vi.fn();
  return { op, fetch, writeFields, syncEnv, calls };
}

function run(s: ReturnType<typeof setup>, slug = 'acme') {
  return provisionDash0({
    op: s.op,
    fetch: s.fetch as unknown as typeof globalThis.fetch,
    slug,
    adminToken: ADMIN_TOKEN,
    apiUrl: `${API}/`,
    otlpEndpoint: OTLP,
    syncEnv: s.syncEnv,
  });
}

describe('provisionDash0', () => {
  it('writes the endpoint and headers to production only', async () => {
    const s = setup();
    const result = await run(s);
    expect(result).toEqual({ dataset: 'created', token: 'created' });
    expect(s.calls).toEqual([
      'PUT /api/datasets/acme',
      'GET /api/auth-tokens/acme-ingest',
      'PUT /api/auth-tokens/acme-ingest',
    ]);
    expect(s.writeFields).toHaveBeenCalledTimes(1);
    const call = s.writeFields.mock.calls[0]?.[0];
    expect(call?.vault).toBe('startup-acme');
    expect(call?.item).toBe('production');
    expect(Object.fromEntries(call?.fields ?? [])).toEqual({
      OTEL_EXPORTER_OTLP_ENDPOINT: OTLP,
      OTEL_EXPORTER_OTLP_HEADERS: `Authorization=Bearer ${INGEST_TOKEN},Dash0-Dataset=acme`,
      OTEL_SERVICE_NAME: 'acme',
    });
    expect(s.syncEnv).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'production' }),
    );
  });

  it('sends a versioned resource for the ingest token', async () => {
    const s = setup();
    await run(s);
    const tokenPut = s.fetch.mock.calls.find(
      ([url, init]) =>
        url.includes('/api/auth-tokens/') && init.method === 'PUT',
    );
    const body = JSON.parse(
      (tokenPut?.[1] as unknown as { body: string }).body,
    );
    expect(body).toMatchObject({
      apiVersion: 'dash0.com/v1alpha1',
      kind: 'Dash0AuthToken',
    });
  });

  it('is idempotent on re-run', async () => {
    const s = setup({
      production: new Map([['OTEL_EXPORTER_OTLP_HEADERS', 'x=y']]),
      datasetStatus: 200,
    });
    const result = await run(s);
    expect(result).toEqual({ dataset: 'reused', token: 'reused' });
    expect(s.calls).toEqual(['PUT /api/datasets/acme']);
    const fields = Object.fromEntries(
      s.writeFields.mock.calls[0]?.[0].fields ?? [],
    );
    expect(fields).not.toHaveProperty('OTEL_EXPORTER_OTLP_HEADERS');
  });

  it('rotates a key the vault does not hold', async () => {
    const s = setup({ tokenExists: true });
    const result = await run(s);
    expect(result.token).toBe('rotated');
    expect(s.calls).toEqual([
      'PUT /api/datasets/acme',
      'GET /api/auth-tokens/acme-ingest',
      'DELETE /api/auth-tokens/acme-ingest',
      'PUT /api/auth-tokens/acme-ingest',
    ]);
  });

  it('rejects a slug Dash0 cannot use', async () => {
    const s = setup();
    await expect(run(s, 'a-very-long-startup-name-over-26')).rejects.toThrow(
      'is not a valid Dash0 dataset id',
    );
    expect(s.fetch).not.toHaveBeenCalled();
  });
});
