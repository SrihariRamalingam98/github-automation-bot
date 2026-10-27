# AGENTS.md — Project Instructions for AI Collaborators

## Project Overview

**Project:** Event-Driven GitHub Automation Bot

**Tech Stack:** Angular, NestJS, TypeScript, PostgreSQL, TypeORM, GitHub OAuth, GitHub Webhooks and Slack Incoming Webhooks.

This application enables GitHub authentication, repository connections, configurable automation rules, webhook processing, GitHub actions, Slack notifications and event monitoring.

## 1. General Guidelines

- Write clean, readable, maintainable and modular code.
- Follow existing project architecture and naming conventions.
- Use strict TypeScript and four-space indentation.
- Avoid unnecessary dependencies and unrelated refactoring.
- Never claim that tests or deployments succeeded without verification.
- Keep `README.md`, `.env.example` and `AI_NOTES.md` updated when relevant.

## 2. Backend — NestJS

- Organize application logic using NestJS domain modules, controllers and services.
- Keep business logic out of controllers.
- Use dependency injection for services and repositories.
- Validate incoming API requests using DTOs.
- Return consistent, safe API errors with request IDs.
- Preserve retryable upstream error metadata.
- Never expose secrets or sensitive database information in logs.

## 3. Frontend — Angular

- Use Angular standalone components.
- Keep component TypeScript, HTML and SCSS in separate files.
- Use `templateUrl` and `styleUrl` for external templates and styles.
- Avoid inline templates, inline styles and HTML style attributes.
- Place API integration inside feature services.
- Keep shared services, models, guards and interceptors under `core`.
- Maintain responsive design and clear loading, success and error states.

## 4. Database — PostgreSQL and TypeORM

- Use TypeORM entities and injected repositories.
- Keep SQL and transaction logic inside services or database-specific modules.
- Preserve existing database mappings and bigint identifiers.
- Keep sensitive columns excluded from default selections.
- Maintain transaction-scoped locking where required.
- Do not enable automatic schema synchronization or destructive schema operations.
- Set `synchronize`, `dropSchema` and `migrationsRun` to `false`.
- Require explicit, reviewed migrations for schema changes.
- Never run destructive database operations without approval.

## 5. GitHub OAuth and Webhooks

- Validate OAuth state and authorization responses.
- Keep OAuth access tokens securely stored.
- Verify GitHub webhook signatures using HMAC-SHA256 and the raw request body before processing.
- Treat all webhook payloads as untrusted input.
- Persist accepted events before acknowledging delivery.
- Enforce unique GitHub delivery IDs.
- Avoid repeated processing and duplicate GitHub actions.
- Preserve these routes:
    - `/auth/github/callback`
    - `/webhooks/github/:repoId`
    - `/health`

## 6. Event Processing and Retry

- Persist webhook events and action statuses in PostgreSQL.
- Use durable background event processing.
- Retry transient provider failures using exponential backoff.
- Respect configured maximum attempts.
- Prevent concurrent workers from processing the same event.
- Skip actions that have already completed.
- Preserve failure details and retry history for dashboard visibility.
- Do not retain temporary retry simulation endpoints in application runtime code.

## 7. Slack Integration

- Store Slack webhook credentials server-side.
- Never expose Slack webhook URLs in frontend code or logs.
- Handle Slack API errors and timeouts.
- Retry temporary failures through the existing event worker.
- Avoid unnecessary duplicate notifications.

## 8. Security

- Keep credentials out of Git and browser bundles.
- Preserve session authentication, CSRF protection and repository ownership checks.
- Validate all user-supplied URLs, identifiers and repository paths.
- Use secure production cookies and HTTPS.
- Preserve PostgreSQL TLS configuration.
- Apply appropriate API rate limiting.
- Redact sensitive information from errors and logs.

## 9. Testing and Quality

Before proposing code for deployment, run:

```bash
npm run format:check
npm run lint
npm run build
npm test
```

- Add unit tests for new business logic.
- Add integration tests for important backend flows.
- Verify webhook signature rejection, deduplication and authorization.
- Test retry recovery and completed-action idempotency.
- Run PostgreSQL integration tests only against an explicitly verified, isolated test target using `TEST_DATABASE_URL`.
- Never use the application's live database as an implicit test fallback.
- Report failed and skipped tests accurately.

## 10. Production Deployment

- Keep production environment variables server-side.
- Preserve the existing Render deployment configuration and hostname.
- Listen on the port supplied by the hosting environment.
- Serve compiled Angular assets through the production backend.
- Ensure generated frontend assets are compatible with Helmet Content Security Policy.
- Run `scripts/verify-production-http.cjs` after building.
- Build before pruning development dependencies.
- Do not perform unreviewed database migrations during startup.
- Never deploy without explicit user approval.

## 11. AI Collaboration Principles

- Review existing code before making changes.
- Make minimal, focused updates.
- Explain important architectural and security decisions.
- Identify assumptions, incomplete verification and remaining limitations.
- Avoid introducing unnecessary test-only functionality into production code.
- Do not commit, push, deploy or modify production credentials without explicit approval.