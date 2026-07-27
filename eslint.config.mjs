import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

const incompatibleReactRules = Object.fromEntries(
  [...nextVitals, ...nextTypeScript]
    .flatMap((configuration) => Object.keys(configuration.rules ?? {}))
    .filter((rule) => rule.startsWith('react/'))
    .map((rule) => [rule, 'off']),
);

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: incompatibleReactRules,
  },
  globalIgnores([
    '.codex-internal/**',
    '.tooling/**',
    '.vitest-attachments/**',
    'dist/**',
    '.next/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'bootstrap/**',
    'bootstrap/source-data/**',
    'src/types/database.ts',
  ]),
]);
