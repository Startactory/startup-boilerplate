import path from 'node:path';
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import reactHooks from 'eslint-plugin-react-hooks';
import {
  evaluateImport,
  isDynamicImportAllowed,
} from './scripts/boundaries/evaluate.mjs';

const REPO_ROOT = path.dirname(new URL(import.meta.url).pathname);

function repoPathOf(filename) {
  return path.relative(REPO_ROOT, filename).split(path.sep).join('/');
}

const domainBoundariesPlugin = {
  rules: {
    enforce: {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Enforce domain isolation rules from scripts/boundaries/manifest.mjs',
        },
        schema: [],
      },
      create(context) {
        const repoPath = repoPathOf(context.filename);
        if (!repoPath.startsWith('src/')) return {};

        function checkSpec(node, spec) {
          const violation = evaluateImport(repoPath, spec);
          if (violation) {
            context.report({
              node,
              message: `[${violation.rule}] ${violation.message}`,
            });
          }
        }

        return {
          ImportDeclaration(node) {
            checkSpec(node, node.source.value);
          },
          'ExportNamedDeclaration[source]'(node) {
            checkSpec(node, node.source.value);
          },
          ExportAllDeclaration(node) {
            if (node.source) checkSpec(node, node.source.value);
          },
          ImportExpression(node) {
            if (
              node.source.type === 'Literal' &&
              typeof node.source.value === 'string'
            ) {
              checkSpec(node, node.source.value);
            } else if (!isDynamicImportAllowed(repoPath)) {
              context.report({
                node,
                message:
                  '[unanalyzable-import] Dynamic import() with a non-literal argument cannot be checked against domain boundaries. Use a static string literal, or allowlist the file in scripts/boundaries/manifest.mjs.',
              });
            }
          },
          CallExpression(node) {
            const isRequire =
              node.callee.type === 'Identifier' &&
              node.callee.name === 'require';
            const isViMock =
              node.callee.type === 'MemberExpression' &&
              node.callee.object.type === 'Identifier' &&
              node.callee.object.name === 'vi' &&
              node.callee.property.type === 'Identifier' &&
              node.callee.property.name === 'mock';
            if (!isRequire && !isViMock) return;
            const arg = node.arguments[0];
            if (
              arg &&
              arg.type === 'Literal' &&
              typeof arg.value === 'string'
            ) {
              checkSpec(node, arg.value);
            } else if (isRequire) {
              context.report({
                node,
                message:
                  '[unanalyzable-import] require() with a non-literal argument cannot be checked against domain boundaries.',
              });
            }
          },
        };
      },
    },
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'drizzle/**',
    'public/**',
  ]),
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "ImportDeclaration[source.value='lucide-react'] ImportNamespaceSpecifier",
          message: 'Use named imports from lucide-react for tree-shaking.',
        },
      ],
    },
  },
  {
    files: ['**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportNamedDeclaration[source]',
          message:
            'Re-exports are not allowed. Import and use the module directly.',
        },
        {
          selector: 'ExportAllDeclaration',
          message: 'Wildcard re-exports (export * from) are not allowed.',
        },
      ],
    },
  },
  {
    files: ['**/*.tsx', '**/*.test.ts'],
    rules: { '@typescript-eslint/explicit-function-return-type': 'off' },
  },
  {
    files: ['src/**/*.{js,jsx,ts,tsx,mjs,cjs}'],
    plugins: { 'domain-boundaries': domainBoundariesPlugin },
    rules: { 'domain-boundaries/enforce': 'error' },
  },
]);

export default eslintConfig;
