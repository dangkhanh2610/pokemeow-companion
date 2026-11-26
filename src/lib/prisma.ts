import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prismaGlobal?: PrismaClient;
};

export function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prismaGlobal) {
    globalForPrisma.prismaGlobal = new PrismaClient({
      log: process.env['NODE_ENV'] === 'development' ? ['error', 'warn'] : ['error'],
    });
  }
  return globalForPrisma.prismaGlobal;
}
