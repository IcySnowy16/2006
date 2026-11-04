/**
 * Task K3: ONE PrismaClient for the whole process (a second client would open a second connection pool).
 * Tests swap it with `setPrisma`.
 */
import { PrismaClient } from '@prisma/client';

let client: PrismaClient | undefined;

export function prisma(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}

export function setPrisma(replacement: PrismaClient | undefined): void {
  client = replacement;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
