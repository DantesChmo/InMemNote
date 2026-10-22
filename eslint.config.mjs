// Flat-config ESLint. Minimal stack: TS + React + import-order + prettier.
// Style is enforced by Prettier — only semantics live here.
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: ['node_modules', '.vite', 'out', 'dist', 'coverage', 'design'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      import: importPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/consistent-type-imports': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'import/order': [
        'warn',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
    settings: {
      react: { version: 'detect' },
    },
  },
  // Layer boundaries (CLAUDE.md §3, ADR 0005). Each pattern list covers both
  // the path alias and the relative form, so `../../infrastructure/x` can't
  // sneak past a rule written for `@infrastructure/*`.
  {
    files: ['src/presentation/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'electron', message: 'The renderer talks to main only via window.inmemnote.' },
          ],
          patterns: [
            {
              group: ['@infrastructure/*', '**/infrastructure/**'],
              message:
                'presentation must not depend on infrastructure — IPC contracts live in @shared/ipc.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/application/**/*.ts'],
    // Use-case specs wire in-memory adapters from infrastructure (ADR 0005 debt).
    ignores: ['src/application/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['electron', 'react', 'better-sqlite3'],
          patterns: [
            {
              group: [
                '@infrastructure/*',
                '**/infrastructure/**',
                '@presentation/*',
                '**/presentation/**',
              ],
              message: 'application depends only on domain and shared.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['electron', 'react', 'better-sqlite3'],
          patterns: [
            {
              group: [
                '@application/*',
                '**/application/**',
                '@infrastructure/*',
                '**/infrastructure/**',
                '@presentation/*',
                '**/presentation/**',
              ],
              message: 'domain depends on nothing but shared.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['electron', 'react', 'better-sqlite3', 'zod'],
          patterns: [
            {
              group: [
                '@domain/*',
                '**/domain/**',
                '@application/*',
                '**/application/**',
                '@infrastructure/*',
                '**/infrastructure/**',
                '@presentation/*',
                '**/presentation/**',
              ],
              message: 'shared is a leaf: it imports nothing outside src/shared.',
            },
          ],
        },
      ],
    },
  },
  prettierConfig,
];
