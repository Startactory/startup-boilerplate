export class ProviderError extends Error {
  constructor({ provider, status, message }) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.status = status;
  }
}

function messageFrom(json, status) {
  const candidate =
    json?.message ?? json?.error?.message ?? json?.error ?? json?.detail;
  if (typeof candidate === 'string' && candidate) return candidate;
  return `request failed with status ${status}`;
}

/**
 * @param {{ provider: string, fetch?: typeof globalThis.fetch, method: string, url: string, token?: string, body?: object }} options
 * @returns {Promise<{ status: number, json: any }>}
 */
export async function requestJson({
  provider,
  fetch = globalThis.fetch,
  method,
  url,
  token,
  body,
}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'startup-boilerplate-scripts',
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (response.status === 404 || response.ok) {
    return { status: response.status, json };
  }
  throw new ProviderError({
    provider,
    status: response.status,
    message: messageFrom(json, response.status),
  });
}
