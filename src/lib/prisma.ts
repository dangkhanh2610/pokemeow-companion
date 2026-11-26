import { Prisma, PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prismaGlobal?: PrismaClient;
};

export function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prismaGlobal) {
    globalForPrisma.prismaGlobal = new PrismaClient({
      log: process.env['NODE_ENV'] === 'development' ? ['warn'] : ['error'],
    });
  }
  return globalForPrisma.prismaGlobal;
}

function isTransientConnectionError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P1017' || error.code === 'P1001' || error.code === 'P2024';
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('closed') ||
      msg.includes('connection reset') ||
      msg.includes('server has closed the connection') ||
      msg.includes("can't reach database server")
    );
  }
  return false;
}

/**
 * Tự động thử lại 1 lần khi Neon PostgreSQL vừa đánh thức từ trạng thái nghỉ.
 */
export async function withDbRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isTransientConnectionError(error)) {
      throw error;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 350);
    });
    return operation();
  }
}
