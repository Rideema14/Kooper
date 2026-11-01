import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const g = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // pg Pool via driver adapter; with Supabase use the pooled (port 6543) URL at runtime.
  const adapter = new PrismaPg({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 5) });
  return new PrismaClient({ adapter });
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    g.prisma ??= create();
    return Reflect.get(g.prisma, prop);
  },
});
