import { describe, expect, it, vi } from 'vitest';
import {
  importGoogleClient,
  readGoogleClientFile,
} from '../../scripts/vault-import-google-client.mjs';

const CLIENT_ID = '1234-abc.apps.googleusercontent.com';
const CLIENT_SECRET = 'GOCSPX-test-secret';

const webFile = JSON.stringify({
  web: { client_id: CLIENT_ID, client_secret: CLIENT_SECRET },
});

describe('readGoogleClientFile', () => {
  it('reads a web client file', () => {
    expect(readGoogleClientFile(webFile)).toEqual({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    });
  });

  it('rejects an installed-app file', () => {
    const installed = JSON.stringify({
      installed: { client_id: CLIENT_ID, client_secret: CLIENT_SECRET },
    });
    expect(() => readGoogleClientFile(installed)).toThrow(
      'not a Google OAuth web client file',
    );
  });

  it('does not quote file contents when the text is not JSON', () => {
    expect(() => readGoogleClientFile(`oops ${CLIENT_SECRET}`)).toThrow(
      /^not a Google OAuth web client file$/,
    );
  });
});

describe('importGoogleClient', () => {
  it('keeps the file when the vault write fails', () => {
    const op = {
      writeFields: vi.fn(() => {
        throw new Error('1Password is locked');
      }),
      readFields: vi.fn(),
    };
    const fs = {
      readFileSync: vi.fn(() => webFile),
      writeFileSync: vi.fn(),
      rmSync: vi.fn(),
    };
    expect(() =>
      importGoogleClient({
        op,
        fs,
        vault: 'startup-acme',
        environment: 'production',
        path: '/tmp/client.json',
      }),
    ).toThrow('1Password is locked');
    expect(fs.rmSync).not.toHaveBeenCalled();
  });

  it('stores both fields, syncs, then deletes the file', () => {
    const op = {
      writeFields: vi.fn(),
      readFields: vi.fn(
        () =>
          new Map([
            ['GOOGLE_CLIENT_ID', CLIENT_ID],
            ['GOOGLE_CLIENT_SECRET', CLIENT_SECRET],
          ]),
      ),
    };
    const fs = {
      readFileSync: vi.fn((path: string) =>
        path === '/tmp/client.json'
          ? webFile
          : 'GOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\n',
      ),
      writeFileSync: vi.fn(),
      rmSync: vi.fn(),
    };
    const result = importGoogleClient({
      op,
      fs,
      vault: 'startup-acme',
      environment: 'production',
      path: '/tmp/client.json',
    });
    expect(op.writeFields).toHaveBeenCalledTimes(1);
    expect(op.writeFields).toHaveBeenCalledWith({
      vault: 'startup-acme',
      item: 'production',
      fields: new Map([
        ['GOOGLE_CLIENT_ID', CLIENT_ID],
        ['GOOGLE_CLIENT_SECRET', CLIENT_SECRET],
      ]),
    });
    expect(fs.rmSync).toHaveBeenCalledWith('/tmp/client.json');
    expect(JSON.stringify(result)).not.toContain(CLIENT_SECRET);
  });
});
