import "./env";
import { PrismaClient } from "@prisma/client";
import { normalizeDatabaseUrl } from "./database-connection";

/**
 * Neon gives you two connection strings for the same database:
 * - `DATABASE_URL` — pooled (PgBouncer), used for normal application traffic.
 * - `DATABASE_URL_UNPOOLED` — direct, used by Prisma CLI for migrations.
 *
 * Prisma's query engine does not understand every libpq parameter that Neon
 * appends (for example `channel_binding`), and it needs `pgbouncer=true` to stop
 * using prepared statements when the connection is pooled. Normalise the URL
 * here so local Postgres, Docker Postgres and Neon all work unchanged.
 */
export function runtimeDatabaseUrl(): string | undefined {
  return normalizeDatabaseUrl(process.env.DATABASE_URL);
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasourceUrl: runtimeDatabaseUrl(),
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
});

// Reuse one pool per process, including production route bundles.
globalForPrisma.prisma = prisma;
