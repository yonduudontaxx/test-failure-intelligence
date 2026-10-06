import { execSync } from 'node:child_process';

export default async function globalSetup(): Promise<void> {
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ?? 'postgresql://tfi:tfi_dev_password@localhost:5432/tfi_test';
  const databaseName = new URL(testDatabaseUrl).pathname.slice(1);
  if (!databaseName.endsWith('_test')) {
    throw new Error(`TEST_DATABASE_URL must point at a *_test database. Got: "${databaseName}"`);
  }
  execSync('npx node-pg-migrate up', {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'inherit',
  });
}
