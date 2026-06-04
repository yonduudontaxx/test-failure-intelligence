import { execSync } from 'node:child_process';

export default async function globalSetup(): Promise<void> {
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ?? 'postgresql://tfi:tfi_dev_password@localhost:5432/tfi_test';
  execSync('npx node-pg-migrate up', {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'inherit',
  });
}
