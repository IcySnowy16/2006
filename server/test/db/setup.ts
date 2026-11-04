/** Runs in every integration test file: point Prisma at the test database and empty it before each test. */
import { afterAll, beforeEach } from 'vitest';
import { TEST_DATABASE_URL } from './testUrl';

process.env.DATABASE_URL = TEST_DATABASE_URL;

beforeEach(async () => {
  const { resetDb } = await import('../helpers/db');
  await resetDb();
});

afterAll(async () => {
  const { disconnectPrisma } = await import('../../src/core/prisma');
  await disconnectPrisma();
});
