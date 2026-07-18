import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./shared/db/schema.ts",
  strict: true,
  verbose: true,
});
