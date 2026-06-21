import "dotenv/config";
import { defineConfig } from "prisma/config";

const defaultDatabaseUrl = "postgresql://postgres:postgres@localhost:5432/showrunner";

export default defineConfig({
  schema: "prisma/schema",
  datasource: {
    url: process.env.DATABASE_URL ?? defaultDatabaseUrl
  },
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  }
});
