# Event-Driven GitHub Automation Bot

Take-home implementation for Abstrabit SDE-2. Single publicly deployable Express/Node app, with GitHub OAuth, repository webhooks, Postgres-backed event processing, automation rules, Slack alerts, and a live dashboard.

## Stack
- Node.js 20+, Express 4, PostgreSQL / Neon
- Static responsive dashboard (vanilla JS; served by the backend)
- GitHub OAuth and REST API
- Slack Incoming Webhook
- PostgreSQL queue polling and Server-Sent Events (SSE)

## Get started locally
1. Install Node 20+, PostgreSQL, and run `npm install`.
2. Copy `.env.example` to `.env` and fill in the values.
3. Create a free Neon PostgreSQL DB (or use local Postgres).
4. Obtain a **public HTTPS URL** for this app. OAuth and GitHub webhooks cannot point to private localhost. A public deployment is simplest. For local debugging, you may use a trusted tunnel providing HTTPS, but check any tunnel service's pricing/requirements.
5. In GitHub Developer Settings → OAuth Apps → New OAuth App:
   - Homepage URL: `https://YOUR-HOST`
   - Authorization callback: `https://YOUR-HOST/auth/github/callback`
   - Copy Client ID and Client Secret to environment variables.
6. In Slack, create a workspace/app, enable **Incoming Webhooks**, and copy a channel webhook URL into `SLACK_WEBHOOK_URL`.
7. Run `npm start`. The server creates its database tables at startup.
8. Open the public URL, sign in, connect an **owned** test repo, and create an issue titled `Bug: login fails`.

### Local commands
```bash
npm install
cp .env.example .env
npm start
npm test
```

### Render deployment
1. Push this project to a private or public GitHub repo (do not commit `.env`).
2. Render → New → Web Service → Connect this GitHub repo.
3. Runtime Node; build command `npm install`; start command `npm start`; choose **Free**.
4. Add all environment variables from `.env.example` using Render's Environment tab. Set `APP_URL=https://YOUR-SERVICE.onrender.com`.
5. Use Neon PostgreSQL database URL; set `DATABASE_SSL=true` for a Neon connection.
6. Set the GitHub OAuth callback URL to the exact Render URL plus `/auth/github/callback`.
7. Visit `/health` and then the root URL.

> **Free-tier caveat:** Render's free service may sleep after 15 minutes and take about a minute to resume; GitHub may retry missed deliveries but this is not a high-availability guarantee. Before your demo, open `/health`, and verify GitHub webhook **Recent Deliveries**. Do not present free hosting as production-grade uptime.

## How to test (no provided passwords)
1. Sign in with your own GitHub account.
2. Connect a throwaway repository you own (you must have administrator permissions).
3. A default rule matches `bug` and applies the `bug` label. **Create this label on the repository first** if absent, or GitHub may create it depending on repository behavior/permissions.
4. Create issue: `Bug: login page fails`.
5. Confirm the label was applied, the Slack message arrived (if configured), and the event is shown as done.
6. Open a PR and push a commit. Those events appear in the dashboard (without bot actions).
7. GitHub Repository → Settings → Webhooks → Recent Deliveries → redeliver a delivery. It is deduplicated by the delivery ID.
8. To exercise retries, temporarily use a wrong Slack webhook URL, open a matching issue, and inspect event/action failure and retry attempts. Restore the valid URL (re-deploy/restart if using env vars) and check it succeeds.

## Security and reliability
- GitHub webhook is verified against HMAC-SHA256 of the **raw** body with a per-repo secret, constant-time compare.
- OAuth `state` is signed and validated. Session cookie is HttpOnly + Secure + SameSite=Lax.
- Write API routes require authentication and a signed double-submit CSRF cookie (see note below).
- Tokens are encrypted at rest with AES-256-GCM using `ENCRYPTION_KEY`. Never log credentials.
- Unique `delivery_id` avoids enqueuing the same webhook twice.
- Event stored before responding HTTP 202; a PostgreSQL lease/worker retries transient action failures with backoff (up to eight attempts).
- GitHub add-label operation is effectively idempotent. Slack Incoming Webhooks do **not** provide a true transactional exactly-once guarantee: if Slack accepts a message but this server crashes before committing the success record, a duplicate Slack message may occur on retry. Documented limitation.
- The worker polls the database every three seconds; only one instance is expected in this demo. The DB lock prevents simultaneous claims across instances.
- Event logs and action statuses are visible in a dashboard scoped to the user.

## Important limitations and hardening backlog
- A newly created GitHub OAuth token uses `repo` scope because the app creates repository webhooks automatically; this is a broad OAuth permission. Restrict usage to a throwaway repo. A GitHub App with minimum per-repo permissions is preferable for production.
- No token refresh/revocation handling. If a user removes GitHub authorization, label calls will fail with retries.
- No webhook cleanup when account/repo disconnects; this starter does not implement repo removal.
- `APP_URL` must always be HTTPS. A production app should add rate limits, reverse-proxy configuration audits, OAuth scope checks and stronger monitoring.
- UI uses an HttpOnly signed CSRF cookie and SameSite policy for server-side validation, but for truly independent CSRF tokens, issue a separate client-readable request token and send it in a custom header. This is a simplified demo technique.
- Worker recovers unfinished events after two minutes. Avoid deploying multiple instances without reviewing lease duration.
- Long-running issue processing may miss lease deadlines at high traffic. Add heartbeat for scale.
- No exact-once Slack semantics; use Slack API with independent application-level reconciliation if required.
- Third-party services' free tiers and card requirements can change: confirm during registration.

## Required files
- `.env.example` (no secrets)
- `AGENTS.md` (AI instructions)
- `AI_NOTES.md` (honest starter template; complete it after personally testing and debugging)

## Architecture
GitHub webhook → HMAC validation → Postgres event row → worker → rule match → GitHub label + Slack alert → actions/events tables → authenticated SSE dashboard.

## Environment variables
See `.env.example`. `SESSION_SECRET` is a random 32+ character string; `ENCRYPTION_KEY` is exactly 32 random bytes in hex (64 hex characters). Generate with `openssl rand -hex 32`.
