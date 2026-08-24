import { defineConfig } from "drizzle-kit";

// `generate` only reads the schema statically and doesn't need a live
// connection, so DATABASE_URL is optional here; db:migrate applies the
// generated SQL itself via src/db/migrate.ts (works against PGlite too,
// which drizzle-kit's own migrate/push commands don't support).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://placeholder:placeholder@localhost:5432/placeholder",
  },
});
