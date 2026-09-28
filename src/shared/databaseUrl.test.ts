import { describe, expect, it } from "vitest";
import { resolveDirectDatabaseUrl, resolvePooledDatabaseUrl } from "./databaseUrl.js";

describe("databaseUrl", () => {
  it("adds Neon pooled connection params", () => {
    const url = resolvePooledDatabaseUrl(
      "postgresql://user:pass@ep-example-pooler.us-east-1.aws.neon.tech/neondb"
    );
    expect(url).toContain("sslmode=require");
    expect(url).toContain("connect_timeout=30");
    expect(url).toContain("pgbouncer=true");
  });

  it("derives a direct Neon URL from a pooled URL", () => {
    const url = resolveDirectDatabaseUrl(
      undefined,
      "postgresql://user:pass@ep-mute-bread-atsipfph-pooler.c-9.us-east-1.aws.neon.tech/neondb"
    );
    expect(url).toContain("ep-mute-bread-atsipfph.c-9.us-east-1.aws.neon.tech");
    expect(url).not.toContain("-pooler");
    expect(url).toContain("sslmode=require");
    expect(url).toContain("connect_timeout=30");
  });
});
