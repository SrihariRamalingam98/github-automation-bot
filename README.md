# Event-Driven GitHub Automation Bot

An event-driven automation application built with **Angular, NestJS, TypeScript, PostgreSQL and TypeORM**. Sign in with GitHub, connect a repository, configure rules, automate GitHub actions, send Slack alerts and inspect event processing through a protected dashboard.

## Features

- **GitHub OAuth:** authenticated sign-in with secure server-side sessions.
- **Repository management:** connect repositories you own and manage GitHub webhook registration.
- **Event ingestion:** receive `issues`, `pull_request` and `push` events; verify webhook signatures before processing.
- **Configurable rules:** match event types and keywords, add GitHub labels where applicable, and notify Slack.
- **Event dashboard:** see status, filters, action outcomes, errors, attempts and retry history.
- **Loading feedback:** a top progress bar and interaction lock cover login, logout, navigation and API requests. Concurrent requests keep the page locked until all complete; errors or cancellation release it. Event and Overview GET requests, including filtered event queries, show no global loader and keep automatic refreshes interactive. The long-lived event stream does not hold the lock.
- **Reliable processing:** persist events in PostgreSQL, deduplicate delivery IDs, process jobs in a background worker and retry transient failures.
- **Security:** CSRF protection, per-user authorization, request validation, encrypted GitHub tokens and redacted logging.

## Architecture

```text
GitHub OAuth ──────────────> NestJS authentication ─────> PostgreSQL sessions

GitHub webhook
    │
    ▼
Raw-body HMAC verification
    │
    ▼
PostgreSQL event commit ───> HTTP 202 Accepted
    │
    ▼
Background worker ────────> Match configured rules
    │                              │
    │                              ├──> GitHub label/comment action (as supported)
    │                              └──> Slack incoming webhook
    ▼
Persistent event/action status ──> Authenticated Angular dashboard
```

The worker uses durable event records, database locking and a bounded retry policy. Successfully completed actions are skipped during normal retries. As with most external APIs, exactly-once delivery cannot be guaranteed in every crash/timeout scenario.

## Tech stack

| Layer          | Technology                                                   |
| -------------- | ------------------------------------------------------------ |
| Frontend       | Angular, standalone components, TypeScript, HTML, SCSS, RxJS |
| Backend        | NestJS, TypeScript, REST API                                 |
| Database       | PostgreSQL (Neon), TypeORM                                   |
| Authentication | GitHub OAuth, server-side sessions                           |
| Integrations   | GitHub Webhooks and REST API, Slack Incoming Webhooks        |
| Testing        | Jest, Vitest, PostgreSQL integration tests                   |
| CI / Hosting   | GitHub Actions, Render                                       |

## Project structure

```text
apps/
  frontend/              Angular app (dashboard, repositories, rules, event logs)
  backend/               NestJS modules, workers, entities and API
scripts/                 Build and verification utilities
.github/workflows/       Continuous integration
.env.example             Required environment variable template
AGENTS.md                Contributor / AI-agent instructions
AI_NOTES.md              Transparent account of AI-assisted development
```

## Requirements

- **Node.js 22.12+** (validated locally on Node.js 22.23.4)
- npm
- PostgreSQL or a Neon PostgreSQL connection
- GitHub OAuth application credentials
- Slack incoming webhook for Slack alerts
- Public HTTPS URL or tunnel for receiving GitHub webhooks

## Local setup

1. Install dependencies from the repository root:

    ```bash
    npm ci --include=dev
    ```

2. Copy `.env.example` to `.env`, and set your own values. Never commit `.env`.

3. Configure `APP_URL=http://localhost:4200` and the GitHub OAuth callback `http://localhost:4200/auth/github/callback`. Use a development database; review and apply the required migrations only to an approved target:

    ```bash
    npm run db:migrate
    ```

4. Start the application:

    ```bash
    npm run dev
    ```

5. Open `http://localhost:4200`. The Angular development server proxies backend API requests to NestJS on `http://localhost:3000`.

For local GitHub webhook delivery, expose **backend port 3000** using a public HTTPS tunnel and configure `WEBHOOK_BASE_URL` with the tunnel origin. Keep `APP_URL` as the browser's local origin. GitHub cannot deliver webhooks to `localhost` directly.

### Key environment variables

Use `.env.example` as the authoritative template.

| Variable               | Purpose                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `APP_URL`              | Browser origin and OAuth redirect base                                                  |
| `WEBHOOK_BASE_URL`     | Public backend origin for GitHub webhook registration (optional; defaults to `APP_URL`) |
| `DATABASE_URL`         | PostgreSQL connection string                                                            |
| `DATABASE_SSL`         | Enable verified TLS for Neon/production                                                 |
| `GITHUB_CLIENT_ID`     | GitHub OAuth client ID                                                                  |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret                                                              |
| `SESSION_SECRET`       | Secure session-signing secret                                                           |
| `ENCRYPTION_KEY`       | AES-256-GCM key for encrypted stored tokens                                             |
| `SLACK_WEBHOOK_URL`    | Slack incoming webhook URL                                                              |
| `NODE_ENV`             | `development` or `production`                                                           |
| `WORKER_ENABLED`       | Controls background event processing                                                    |
| `EVENT_MAX_ATTEMPTS`   | Maximum total processing attempts (default: `5`)                                        |
| `TRUST_PROXY_HOPS`     | Trusted reverse-proxy hop count, verified for the hosting environment                   |
| `TEST_DATABASE_URL`    | Explicit **isolated test database** only; never use the application database implicitly |

Store all credentials server-side. Do not place passwords, tokens or webhook secrets in frontend bundles or GitHub commits.

## GitHub and Slack configuration

1. Create a GitHub OAuth application in GitHub Developer Settings. Set the callback to your actual app origin plus `/auth/github/callback`.
2. Sign in, then connect a repository you own through **Repositories**. The backend registers webhooks for issue, pull request and push events.
3. Confirm webhook delivery in **GitHub → Repository → Settings → Webhooks → Recent Deliveries**.
4. Create a Slack app with **Incoming Webhooks**, choose a channel and set `SLACK_WEBHOOK_URL` privately.
5. In **Rules**, configure the desired event type, keyword and actions. For example, an `issues.opened` event containing `bug` can add the `bug` label and send a Slack alert. Create the label in your test repository if needed.
6. Inspect processed events, actions and retry details in **Event Logs**.

## Example automation

```text
New GitHub issue: "Bug in Login API"
        ↓
Verified issues.opened webhook
        ↓
Rule matches keyword "bug"
        ↓
Add GitHub label "bug" + send Slack notification
        ↓
Event Logs displays action results and final status
```

Push events can trigger notifications; labeling applies only to supported issue/PR events. Rule behavior depends on the configuration saved in the dashboard.

## Testing

Run from the repository root:

```bash
npm run format:check
npm run lint
npm run build
npm test
node scripts/verify-production-http.cjs
```

PostgreSQL-specific tests require an explicit disposable `TEST_DATABASE_URL`:

```bash
npm run test:integration
```

Do not point `TEST_DATABASE_URL` to the production/application database. Database integration tests can write fixtures and use locks. The GitHub Actions workflow provisions PostgreSQL 16 for CI.

### Latest recorded verification (October 23, 2026)

| Check                                 | Recorded result                            |
| ------------------------------------- | ------------------------------------------ |
| Node.js 22 build, lint and formatting | Passed                                     |
| Backend automated tests               | 170 passed in latest reported run          |
| Angular automated tests               | 30 passed                                  |
| PostgreSQL integration tests          | 4 passed in a separate dedicated run       |
| Production HTTP/asset checks          | Passed locally                             |
| GitHub issue, PR and push events      | Tested locally                             |
| GitHub labeling and Slack delivery    | Tested locally                             |
| Duplicate webhook redelivery          | Tested locally                             |
| Transient Slack failure/recovery      | Passed using simulated 503 → 200 responses |

**Scope:** The four PostgreSQL integration tests were not rerun in the latest general test invocation. Live acceptance of this version on Render remains pending; local tests are not a substitute for production verification.

## Deployment on Render

The application is designed to deploy as a single Node web service serving the compiled Angular UI and NestJS APIs.

**Existing service URL:** https://github-automation-bot-icif.onrender.com/

Use the **repository root** as the service root and configure:

```text
Build Command: npm ci --include=dev && npm run build && npm prune --omit=dev --ignore-scripts
Start Command: npm start
Health Check Path: /health
```

Set `NODE_ENV=production`, `NODE_VERSION=22.23.4`, `DATABASE_SSL=true`, `APP_URL=https://github-automation-bot-icif.onrender.com`, and your server-side credentials. Set `WEBHOOK_BASE_URL` to the same public origin or leave it unset. Verify `TRUST_PROXY_HOPS` against the actual ingress topology. Render supplies `PORT`; do not set `TEST_DATABASE_URL` there.

The production GitHub OAuth callback must match:

```text
https://github-automation-bot-icif.onrender.com/auth/github/callback
```

Configure `WORKER_ENABLED` deliberately and ensure two application versions do not process the same queue concurrently. **Startup does not apply database migrations automatically**; review migrations separately. Deployment and end-to-end live validation of the current application version must be completed before claiming production acceptance.

## Security and reliability notes

- Webhooks require HMAC-SHA256 verification over the original request bytes before event processing.
- Events are committed before the webhook is acknowledged with HTTP 202.
- Delivery IDs are unique; previously completed actions are not intentionally re-executed on normal retries.
- Worker concurrency is controlled through PostgreSQL locks, with lease recovery and exponential backoff for retryable failures.
- Secrets remain server-side; API errors and logs are designed not to reveal credentials.
- The full development/build dependency audit recorded **33 affected package entries** (including two critical reports), while the production-only dependency audit reported **zero advisories** at the time of review. These findings require continued monitoring; zero runtime advisories does not establish zero risk.

### Known limitations

- Slack Incoming Webhooks do not guarantee exactly-once delivery after ambiguous timeouts or crashes.
- Rate limits are local to the application process and would require a shared limiter for multi-instance deployment.
- Rules are evaluated at processing time; changing rules can affect pending events.
- Large-scale load testing and production monitoring are not yet demonstrated.
- Some GitHub webhook registration failures can leave orphaned remote hooks requiring operator review.

## Submission and AI disclosure

- [`AGENTS.md`](AGENTS.md) — project development and security guidelines.
- [`AI_NOTES.md`](AI_NOTES.md) — AI tools used, work performed, testing evidence and limitations.
- [`.env.example`](.env.example) — configuration template without real credentials.

This repository includes the application's source, tests, configuration and CI workflow. Features or checks that have not been exercised in the live deployed version should remain explicitly marked pending until verified.
