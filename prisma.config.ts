import "dotenv/config";
import { defineConfig } from "prisma/config";

const LOCAL_DATABASE_URL =
  "postgresql://light_garment:light_garment_password@localhost:5432/light_garment_erp?schema=public";

function prismaDirectUrl() {
  const base = process.env.DIRECT_URL || process.env.DATABASE_URL || LOCAL_DATABASE_URL;
  if (!base.includes(".neon.tech")) return base;
  const parsed = new URL(base.replace(/^postgres:\/\//, "postgresql://").replace("-pooler", ""));
  parsed.searchParams.set("sslmode", "require");
  parsed.searchParams.set("connect_timeout", "30");
  return parsed.toString();
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: prismaDirectUrl()
  }
});
