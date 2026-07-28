# Kola

Kola is a Cameroon-first commerce and logistics platform that brings storefronts, orders, delivery operations, payments, tracking, and customer communication into one workspace.

## Product scope

Kola supports:

- customer storefronts and mobile checkout
- vendor product, stock, order, and operations management
- courier assignment, pickup, delivery, and live tracking
- private order messaging and media uploads
- WhatsApp OTP authentication
- Fapshi payment initiation and reconciliation
- reviews, support workflows, and platform administration

## Technology

- Next.js 16 and React 19
- TypeScript
- Tailwind CSS 4
- vinext and Vite
- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2
- Drizzle ORM

## Requirements

- Node.js 22.13 or newer
- npm
- Cloudflare bindings and runtime secrets for features used locally or in production

## Local development

```bash
npm install
npm run dev
```

Build and verify the application:

```bash
npm run lint
npm test
```

The current `test` script performs a production build before running the repository test suite.

## Cloudflare bindings

The hosted application expects these bindings:

| Binding | Service | Purpose |
| --- | --- | --- |
| `DB` | Cloudflare D1 | Application data, sessions, orders, payments, and operations |
| `MEDIA` | Cloudflare R2 | Private order-chat media |

## Runtime secrets and configuration

Configure secrets outside Git. Never commit `.env`, `.dev.vars`, API keys, or production credentials.

Core configuration includes:

- `AUTH_SESSION_SECRET`
- `WASENDER_API_KEY`
- `KOLA_SUPERADMIN_PHONE`
- `FAPSHI_API_USER`
- `FAPSHI_API_KEY`
- `FAPSHI_BASE_URL` when overriding the default live environment
- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`
- `MAPS_API_KEY`

`AUTH_SESSION_SECRET` is mandatory for security-sensitive hashing. The application must not be deployed without it.

## Database

The Drizzle schema is located at:

```text
db/schema.ts
```

Migration files are stored in:

```text
drizzle/
```

Generate a migration after schema changes:

```bash
npm run db:generate
```

Review generated SQL before applying it to any shared or production database.

## Main application areas

```text
app/                  Pages, API routes, authentication, security, and domain logic
db/                   Drizzle schema
drizzle/              D1 migrations
public/                Public assets
tests/                 Automated checks
.openai/hosting.json   Hosted D1 and R2 binding declaration
```

## Security notes

- Session cookies are `HttpOnly`, `Secure`, and `SameSite=Lax`.
- Session tokens are stored as hashes.
- State-changing requests should reject cross-site mutations.
- Payment completion must be verified with Fapshi before an order is marked paid.
- Access to private order data and media must be checked server-side.
- Administrative actions must be authorized by role and recorded where appropriate.

## Current maturity

Kola is a feature-rich pre-production MVP. Authentication, payments, permissions, database migrations, and order-state transitions must pass behavioral tests and production-readiness review before a public launch.

Production-hardening work is tracked in GitHub Issue #1.
