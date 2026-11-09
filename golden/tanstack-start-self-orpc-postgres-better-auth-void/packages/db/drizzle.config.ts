import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

const serverEnvFile = "../../apps/web/.env";

if (existsSync(serverEnvFile)) {
  process.loadEnvFile(serverEnvFile);
}

const url = process.env.DATABASE_URL;

if (url === undefined) {
  throw new Error(
    "DATABASE_URL is not set: see the Environment section of README.md, then write apps/web/.env"
  );
}

export default defineConfig({
  dbCredentials: { url },
  dialect: "postgresql",
  out: "./src/migrations",
  schema: "./src/schema",
});
