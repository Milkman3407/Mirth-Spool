import { defineConfig } from "prisma/config";

const unavailableDatabaseUrl =
  "postgresql://mirthspool:unavailable@127.0.0.1:1/mirthspool";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Client generation is database-free. Migration commands without an
    // explicit DATABASE_URL fail closed against an unreachable local port.
    url: process.env.DATABASE_URL ?? unavailableDatabaseUrl,
  },
});
