import { execSync } from "node:child_process";
import "dotenv/config";
import { resolveDirectDatabaseUrl } from "../src/shared/databaseUrl.js";

const maxAttempts = 6;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function pushSchema(attempt: number) {
  console.log(`Pushing database schema (attempt ${attempt}/${maxAttempts})...`);
  execSync("npx prisma db push --accept-data-loss", {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: resolveDirectDatabaseUrl()
    }
  });
}

async function main() {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await pushSchema(attempt);
      console.log("Database schema is up to date.");
      execSync("npm run db:seed", { stdio: "inherit", env: process.env });
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        console.error("Database setup failed after multiple attempts.");
        throw error;
      }
      const waitMs = attempt * 5000;
      console.log(`Database not reachable yet. Retrying in ${waitMs / 1000}s...`);
      await sleep(waitMs);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
