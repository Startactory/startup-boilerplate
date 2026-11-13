import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = vi.hoisted(() => {
  const state = {
    selectedColumns: [] as Record<string, unknown>[],
    rows: [] as unknown[],
  };
  const resolveRows = (): Promise<unknown[]> => Promise.resolve(state.rows);
  const builder = {
    from: () => builder,
    where: () => builder,
    orderBy: resolveRows,
    limit: resolveRows,
  };
  return {
    state,
    db: {
      select: (columns: Record<string, unknown>) => {
        state.selectedColumns.push(columns);
        return builder;
      },
    },
  };
});

vi.mock('@/infra/database/connection', () => ({ db: mockDb.db }));

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  listLinkedAccountsForUser,
  listSessionsForUser,
} from './user-data-repo';

const SECRET_COLUMNS = [
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'password',
];

beforeEach(() => {
  mockDb.state.selectedColumns = [];
  mockDb.state.rows = [];
});

describe('listLinkedAccountsForUser', () => {
  it('selects only the provider, the account id and the link date', async () => {
    await listLinkedAccountsForUser('user-1');

    const selected = Object.keys(mockDb.state.selectedColumns[0] ?? {});
    expect(selected).toEqual(['providerId', 'accountId', 'createdAt']);
    for (const column of SECRET_COLUMNS) {
      expect(selected).not.toContain(column);
    }
  });

  it('never maps a token into the record even if the row carried one', async () => {
    mockDb.state.rows = [
      {
        providerId: 'google',
        accountId: 'google-sub-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        accessToken: 'secret-access',
        refreshToken: 'secret-refresh',
      },
    ];

    const result = await listLinkedAccountsForUser('user-1');

    expect(result._unsafeUnwrap()).toEqual([
      {
        providerId: 'google',
        accountId: 'google-sub-1',
        linkedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });
});

describe('listSessionsForUser', () => {
  it('never selects the session token', async () => {
    mockDb.state.rows = [
      {
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        expiresAt: new Date('2026-03-08T00:00:00.000Z'),
        ipAddress: '203.0.113.7',
        userAgent: 'Mozilla/5.0',
      },
    ];

    const result = await listSessionsForUser('user-1');

    const selected = Object.keys(mockDb.state.selectedColumns[0] ?? {});
    expect(selected).toEqual([
      'createdAt',
      'expiresAt',
      'ipAddress',
      'userAgent',
    ]);
    expect(result._unsafeUnwrap()).toEqual([
      {
        createdAt: '2026-03-01T00:00:00.000Z',
        expiresAt: '2026-03-08T00:00:00.000Z',
        ipAddress: '203.0.113.7',
        userAgent: 'Mozilla/5.0',
      },
    ]);
  });
});
