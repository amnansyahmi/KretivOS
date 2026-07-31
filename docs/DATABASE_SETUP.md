# KretivOS Database Setup

KretivOS uses Neon PostgreSQL as the shared production database.

## Security first

Never commit a live database connection string to GitHub. Store it only in local `.env.local` and Vercel Environment Variables.

If a connection string is shared in chat, email, a ticket, screenshot, or source code, rotate the database password in Neon before using it in production.

## Environment variables

Add the pooled Neon connection string as:

```env
DATABASE_URL="postgresql://USER:PASSWORD@YOUR-ENDPOINT-pooler.REGION.aws.neon.tech/neondb?sslmode=require"
```

For the temporary internal access layer, also add:

```env
KRETIVOS_ACCESS_KEY="a-long-random-secret"
```

Add both variables to Vercel for Production, Preview, and Development, then redeploy.

## Apply the schema

1. Open the Neon project.
2. Open **SQL Editor**.
3. Run `db/migrations/0001_initial.sql`.
4. Run `db/migrations/0002_seed_reference_data.sql`.
5. Open `/api/db/health` on the deployed KretivOS URL.

A successful response looks like:

```json
{
  "ok": true,
  "database": "neondb",
  "serverTime": "...",
  "postgresVersion": "PostgreSQL ..."
}
```

## Current database scope

The initial schema covers:

- Organizations and internal users
- Customers, contacts, brands and Brand DNA
- Marketing channel master records
- CRM opportunities
- Sales documents
- Finance transactions, scenarios and settlements
- Projects, tasks and onboarding
- Funnels, stages and activities
- Content templates
- Knowledge entries
- Document templates and generated documents
- Asset metadata
- Automation recipes, events, approvals and runs
- Notifications and audit logs
- Temporary workspace state used during localStorage migration

## Migration plan from browser storage

The application currently has browser-stored records from the prototype. Migration should happen module by module:

1. Authentication and organization context
2. Customers, contacts and brands
3. CRM, sales, finance, settlements and projects
4. Funnels, channel master and content templates
5. Knowledge and Brand DNA
6. Document templates, generated documents and assets
7. Automations, notifications and audit history
8. Remove localStorage as the source of truth

During migration, localStorage may be retained only as an offline cache. PostgreSQL must become the authoritative record.

## Connection choice

Use the Neon pooled hostname for deployed application traffic. It is designed for serverless concurrency. Administrative tools and migration systems may use a direct, non-pooler connection when required.
