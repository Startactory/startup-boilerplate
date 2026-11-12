import { NextResponse } from 'next/server';
import { env } from '@/shared/env';

export const dynamic = 'force-dynamic';

interface VersionResponse {
  deploymentId: string | null;
  commitSha: string | null;
}

export function GET(): NextResponse<VersionResponse> {
  const { VERCEL_DEPLOYMENT_ID, VERCEL_GIT_COMMIT_SHA } = env();
  return NextResponse.json({
    deploymentId: VERCEL_DEPLOYMENT_ID ?? null,
    commitSha: VERCEL_GIT_COMMIT_SHA ?? null,
  });
}
