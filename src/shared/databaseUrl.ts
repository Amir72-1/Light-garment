const LOCAL_DATABASE_URL =
  "postgresql://light_garment:light_garment_password@localhost:5432/light_garment_erp?schema=public";

function normalizeProtocol(url: string) {
  return url.replace(/^postgres:\/\//, "postgresql://");
}

function isNeonHost(hostname: string) {
  return hostname.includes(".neon.tech");
}

export function toDirectNeonHost(hostname: string) {
  return hostname.replace("-pooler", "");
}

function withQueryParams(url: string, params: Record<string, string>) {
  const parsed = new URL(normalizeProtocol(url));
  for (const [key, value] of Object.entries(params)) {
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

export function resolvePooledDatabaseUrl(url = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL) {
  const parsed = new URL(normalizeProtocol(url));
  if (!isNeonHost(parsed.hostname)) return url;

  return withQueryParams(url, {
    sslmode: "require",
    connect_timeout: "30",
    pool_timeout: "30",
    pgbouncer: "true",
    connection_limit: "10"
  });
}

export function resolveDirectDatabaseUrl(
  directUrl = process.env.DIRECT_URL,
  databaseUrl = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL
) {
  const base = directUrl || databaseUrl;
  const parsed = new URL(normalizeProtocol(base));
  if (isNeonHost(parsed.hostname)) {
    parsed.hostname = toDirectNeonHost(parsed.hostname);
  }

  if (!isNeonHost(parsed.hostname)) {
    return directUrl || databaseUrl;
  }

  return withQueryParams(parsed.toString(), {
    sslmode: "require",
    connect_timeout: "30"
  });
}
