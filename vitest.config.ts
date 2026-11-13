import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // why: Node 25's built-in global localStorage shadows jsdom's Web Storage
    execArgv: ['--no-experimental-webstorage'],
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: [
      'node_modules',
      '.next',
      'dist',
      '.claude/worktrees/**',
      '.superpowers/**',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './test/server-only-shim.ts'),
    },
  },
});
