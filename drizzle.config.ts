import { defineConfig } from 'drizzle-kit';

const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// CI sets only DATABASE_URL, so infer TLS from the host when DATABASE_SSL is absent.
const isLocalHost = /@(localhost|127\.0\.0\.1)[:/]/.test(DB_URL);
const ssl =
  process.env.DATABASE_SSL === 'allow' || process.env.DATABASE_SSL === 'require'
    ? process.env.DATABASE_SSL
    : isLocalHost
      ? 'allow'
      : 'require';

export default defineConfig({
  schema: './src/infra/database/schema',
  out: './drizzle',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: {
    url: DB_URL,
    ssl,
  },
  verbose: true,
});
