/** The test database. Override with DATABASE_URL_TEST (CI sets it to its service container). */
export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST ?? 'postgresql://campushop:campushop@localhost:5433/campushop_test';
