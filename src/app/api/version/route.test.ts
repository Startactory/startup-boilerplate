import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/env', () => ({ env: envMock }));

import { GET } from './route';

describe('GET /api/version', () => {
  beforeEach(() => {
    envMock.mockReset();
  });

  it('returns the deployment id and the commit sha', async () => {
    envMock.mockReturnValue({
      VERCEL_DEPLOYMENT_ID: 'dpl_123',
      VERCEL_GIT_COMMIT_SHA: 'abc123',
    });
    const body = await GET().json();
    expect(body).toEqual({ deploymentId: 'dpl_123', commitSha: 'abc123' });
  });

  it('returns null for both when Vercel does not provide them', async () => {
    envMock.mockReturnValue({});
    const body = await GET().json();
    expect(body).toEqual({ deploymentId: null, commitSha: null });
  });
});
