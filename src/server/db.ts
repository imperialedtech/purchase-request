import "server-only";
import { PrismaClient, Prisma } from "@prisma/client";
import { databaseUrl } from "./env";

// Prisma validates DIRECT_URL even at runtime; it is only used by migrations.
process.env.DIRECT_URL ||= process.env.POSTGRES_URL_NON_POOLING || databaseUrl();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: databaseUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Prisma.TransactionClient;
export type DB = PrismaClient | Tx;
export { Prisma };
