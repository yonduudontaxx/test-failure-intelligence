import nextConfig from 'eslint-config-next';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  ...nextConfig,
  eslintConfigPrettier,
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
];
