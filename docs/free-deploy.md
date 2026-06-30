# Free-tier deployment guide

This ERP is deploy-ready, but publishing to a real cloud requires your own free cloud accounts and environment variables. I cannot create those accounts from this workspace.

## Recommended no-card/free path

Use:

- A free PostgreSQL database such as Neon or Supabase.
- A free Node/Docker web service such as Render, Koyeb, or another provider with a Node web service tier.

Free tiers can change, sleep, pause, or be deleted by providers. For long-term business use, keep database backups.

## Required environment variables

Set these in the web service:

```bash
NODE_ENV=production
PORT=4000
DEMO_MODE=false
JWT_SECRET=<long-random-secret>
DATABASE_URL=<free-postgres-connection-url>
CORS_ORIGIN=<your-public-app-url>
INITIAL_OWNER_NAME=<optional-owner-name>
INITIAL_OWNER_EMAIL=<optional-owner-email>
INITIAL_OWNER_PASSWORD=<optional-owner-password>
```

Do not deploy real usage with `DEMO_MODE=true`; demo mode is in-memory and resets on restart.

If the initial owner variables are omitted and no Owner user exists, the seed creates `amir_kiar2001@yahoo.com` with password `Amirkiar1`.

## Render blueprint

The repository includes `render.yaml`.

1. Create a free PostgreSQL database and copy its connection string.
2. In Render, create a new Blueprint/Web Service from this repository.
3. Set `DATABASE_URL` to the PostgreSQL connection string.
4. Set `CORS_ORIGIN` to the public URL Render gives the app.
5. Deploy.

The start command runs:

```bash
npm run start:deploy
```

That command pushes the Prisma schema, seeds required roles/demo users idempotently, then starts the Express + React app.

The Render build command is intentionally:

```bash
npm ci --include=dev && npm run build
```

TypeScript, Vite, Prisma CLI, and `@types/*` packages are needed at build time even though the app runs in production mode.
The repository also includes `.npmrc` with `include=dev` so Render does not omit declaration packages during `tsc`.
`postinstall` runs `prisma generate`, and the production server starts from `dist/server/server.js`.

## First login

After deployment, log in with `INITIAL_OWNER_EMAIL` and `INITIAL_OWNER_PASSWORD`, or the default fallback `amir_kiar2001@yahoo.com` / `Amirkiar1` if you did not set them.

Immediately change the owner password in Settings -> User management after publishing. The Owner can change passwords for all users from that page.

## Important production notes

- PostgreSQL data is persistent if the free database remains active.
- Employee profile pictures are saved inside PostgreSQL as durable data URLs, so they survive Render redeploys and restarts.
- Product images and other legacy `/uploads/` files may still use the app filesystem. Free web services often have ephemeral disks, so those uploads may be lost after redeploy/restart unless the provider offers persistent storage.
- Schedule periodic database exports/backups from your database provider.
- Keep the app URL private until passwords and owner users are changed.
