# AI-assisted development

## Tools and division of work

I used ChatGPT and OpenAI Codex for requirement breakdown, implementation, debugging, security review and documentation. Exact model/version identifiers were not consistently recorded, so I cannot provide a reliable model history. The project instruction file is [AGENTS.md](AGENTS.md).

I directed the Angular/NestJS migration, requested PostgreSQL-backed retries and security checks, and tested integrations interactively. AI helped implement modules, TypeORM mappings, Angular views, tests and verification scripts. I used logs, GitHub delivery responses and test output to evaluate generated work. AI assistance extended to this submission documentation.

## Decisions I directed

- **Angular and NestJS migration:** use standalone Angular features and NestJS domain modules to separate UI, API integration and backend processing responsibilities.
- **Durable PostgreSQL processing:** preserve events and action outcomes across restarts, deduplicate delivery IDs and skip completed actions during normal retries instead of relying on an in-memory queue.
- **Backend event grouping:** move issue/PR grouping from Angular to the backend and paginate groups there, while preserving individual deliveries and their action history in storage.

## A specific AI wrong turn and correction

The AI-assisted first approach grouped only deliveries already loaded by the frontend. Grouping therefore depended on which deliveries were in the fetched page: deliveries for the same issue outside that page could not be represented together. I questioned whether grouping belonged in the frontend or backend and explicitly requested backend handling with pagination and error handling.

The correction introduced a NestJS event-history service that selects groups before pagination and exposes separately paginated delivery history. Angular now displays server results. Existing grouping cases moved to backend tests, and frontend fixtures were adjusted. An important gap remains: the new PostgreSQL grouping/window queries were inspected through offline TypeORM SQL generation but have not been executed against a verified isolated database. Passing mocked tests does not close that gap.

## Reliability and verification evidence

A challenging integration case was GitHub labeling succeeding while Slack failed. Durable action status, exponential backoff and skipping completed actions allow the failed notification to retry without intentionally repeating completed work. A temporary development simulation exercised Slack HTTP 503 followed by 200; its runtime routes and UI were subsequently removed. Slack Incoming Webhooks cannot guarantee exactly-once delivery after an ambiguous timeout or crash.

Previously recorded verification: **180 backend and 32 Angular tests passed**, with four PostgreSQL tests skipped in that general run. Four PostgreSQL tests passed in an earlier dedicated run; that result does not verify later pagination queries. Builds, lint and local production HTTP checks passed in the recorded feature run. Focused feature formatting passed; repository-wide formatting warnings were recorded separately. These are historical results, not fresh checks performed while preparing this document. See [README.md](README.md#testing) for commands and scope.

## What I would improve

Run the new queries against an explicitly verified isolated PostgreSQL target, finish live acceptance of the deployed version, resolve development/build dependency advisories and improve shared rate limiting and production monitoring. The earlier audit recorded 33 development/build findings and zero production advisories; this is not a current audit. Optional future work includes a free-tier in-app AI triage step and GitHub App authentication. No commit, deployment or live database change is implied by this document.
