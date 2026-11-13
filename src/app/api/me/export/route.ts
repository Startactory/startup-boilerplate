import { exportPersonalData } from '@/application/me/export-personal-data';
import { requireSignedInRoute } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';
import { getStartupProfile } from '@/shared/startup-profile/startup-profile';

const EVENT = 'api.me.export';

function toFileSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function exportFileName(exportedAt: string): string {
  const date = exportedAt.slice(0, 10);
  const appSlug = toFileSlug(getStartupProfile().name);
  const prefix = appSlug ? `${appSlug}-` : '';
  return `${prefix}data-export-${date}.json`;
}

export async function GET(): Promise<Response> {
  const guard = await requireSignedInRoute({
    rateLimit: 'default',
    event: EVENT,
  });
  if (!guard.ok) return guard.response;

  const result = await exportPersonalData();
  if (result.isErr()) {
    log.warn(`${EVENT}.failure`, {
      userId: guard.ctx.userId,
      reason: result.error.code,
    });
    return jsonError(result.error);
  }

  log.info(`${EVENT}.success`, { userId: guard.ctx.userId });
  return new Response(JSON.stringify(result.value, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${exportFileName(result.value.exportedAt)}"`,
      'cache-control': 'no-store',
    },
  });
}
