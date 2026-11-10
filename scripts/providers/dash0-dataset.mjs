import { validateEnvValue } from '../env/rules.mjs';
import {
  ITEM_FOR_ENVIRONMENT,
  masterKeyName,
  readStartupConfig,
  startupVault,
} from '../vault/names.mjs';
import { createOp } from '../vault/op.mjs';
import { syncEnvFile } from '../vault-sync.mjs';
import { requestJson } from './http.mjs';
import { readMasterKeys } from './master-keys.mjs';

const PRODUCTION_ITEM = ITEM_FOR_ENVIRONMENT.production;
const DATASET_SLUG_PATTERN = /^[a-zA-Z0-9_-]{3,26}$/;
const HEADERS_FIELD = 'OTEL_EXPORTER_OTLP_HEADERS';

function assertValidEnvValue(name, value) {
  const { errors } = validateEnvValue(name, value, {
    environment: 'production',
  });
  if (errors.length > 0) {
    throw new Error(`${name} is invalid: ${errors.join('; ')}`);
  }
}

async function putIngestToken({ call, baseUrl, slug, origin }) {
  const response = await call({
    method: 'PUT',
    url: `${baseUrl}/api/auth-tokens/${origin}`,
    body: {
      kind: 'Dash0AuthToken',
      metadata: {
        name: `${slug} ingest`,
        labels: { 'dash0.com/origin': origin },
      },
      spec: {
        actions: ['ingest:*'],
        scope: {
          datasets: { restriction: 'restricted', slugs: [slug] },
        },
      },
    },
  });
  const token = response.json?.spec?.token;
  if (!token) throw new Error(`Dash0 returned no token for ${origin}`);
  return token;
}

export async function provisionDash0({
  op,
  fetch = globalThis.fetch,
  slug,
  adminToken,
  apiUrl,
  otlpEndpoint,
  syncEnv = syncEnvFile,
}) {
  if (!DATASET_SLUG_PATTERN.test(slug)) {
    throw new Error(
      `slug "${slug}" is not a valid Dash0 dataset id (3-26 letters, digits, - or _)`,
    );
  }
  assertValidEnvValue('OTEL_EXPORTER_OTLP_ENDPOINT', otlpEndpoint);

  const baseUrl = apiUrl.replace(/\/$/, '');
  const origin = `${slug}-ingest`;
  const vault = startupVault(slug);
  const call = (options) =>
    requestJson({ provider: 'dash0', fetch, token: adminToken, ...options });

  const datasetResponse = await call({
    method: 'PUT',
    url: `${baseUrl}/api/datasets/${slug}`,
    body: {
      apiVersion: 'dash0.com/v1alpha1',
      kind: 'Dash0Dataset',
      metadata: { name: slug, labels: { 'dash0.com/id': slug } },
      spec: {},
    },
  });
  const dataset = datasetResponse.status === 201 ? 'created' : 'reused';

  const stored = op.readFields({ vault, item: PRODUCTION_ITEM });
  const fields = new Map([
    ['OTEL_EXPORTER_OTLP_ENDPOINT', otlpEndpoint],
    ['OTEL_SERVICE_NAME', slug],
  ]);

  let token = 'reused';
  if (!stored?.get(HEADERS_FIELD)) {
    const existing = await call({
      method: 'GET',
      url: `${baseUrl}/api/auth-tokens/${origin}`,
    });
    token = 'created';
    if (existing.status !== 404) {
      await call({
        method: 'DELETE',
        url: `${baseUrl}/api/auth-tokens/${origin}`,
      });
      token = 'rotated';
    }
    const secret = await putIngestToken({ call, baseUrl, slug, origin });
    const headers = `Authorization=Bearer ${secret},Dash0-Dataset=${slug}`;
    assertValidEnvValue(HEADERS_FIELD, headers);
    fields.set(HEADERS_FIELD, headers);
  }

  op.writeFields({ vault, item: PRODUCTION_ITEM, fields });
  syncEnv({ op, vault, environment: 'production' });
  return { dataset, token };
}

async function main() {
  try {
    const { slug, dataRegion } = readStartupConfig();
    const op = createOp();
    const tokenKey = masterKeyName('DASH0_AUTH_TOKEN', dataRegion);
    const apiKey = masterKeyName('DASH0_API_URL', dataRegion);
    const otlpKey = masterKeyName('DASH0_OTLP_ENDPOINT', dataRegion);
    const keys = readMasterKeys({ op, fields: [tokenKey, apiKey, otlpKey] });
    const { dataset, token } = await provisionDash0({
      op,
      slug,
      adminToken: keys.get(tokenKey),
      apiUrl: keys.get(apiKey),
      otlpEndpoint: keys.get(otlpKey),
    });
    console.log(
      `OK  dataset ${slug} ${dataset}, ingest token ${token}, stored in ${startupVault(slug)}/${PRODUCTION_ITEM}`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('dash0-dataset.mjs')) {
  await main();
}
