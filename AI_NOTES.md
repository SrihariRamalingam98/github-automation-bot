# AI-assisted development

## Tools and division of work

I used ChatGPT and OpenAI Codex to assist with requirement breakdown, implementation, debugging, security review, testing support, and documentation. Exact model/version identifiers were not consistently recorded, so I cannot provide a reliable model history. Project-level AI instructions are documented in [AGENTS.md](AGENTS.md).

I directed the Angular/NestJS migration, requested PostgreSQL-backed retry handling and security checks, and tested integrations interactively. AI assisted with implementing modules, TypeORM mappings, Angular views, tests, and verification scripts.

I reviewed generated changes using application logs, GitHub webhook delivery responses, test results, and manual integration testing before accepting or modifying them. AI assistance was also used when preparing this submission documentation.

## Decisions I directed

- **Angular and NestJS migration:** Use standalone Angular features and NestJS domain modules to separate UI, API integration, and backend processing responsibilities.
- **Durable PostgreSQL processing:** Persist events and action outcomes across application restarts, deduplicate GitHub delivery IDs, and skip already completed actions during retries instead of relying only on an in-memory queue.
- **Backend event grouping:** Move issue and pull-request event grouping from Angular to the backend and perform pagination there, while retaining individual webhook deliveries and their action history in storage.

## A specific AI wrong turn and correction

The initial AI-assisted implementation grouped only the deliveries already loaded by the frontend. As a result, grouping depended on the currently fetched page. Deliveries belonging to the same issue or pull request but located on another page could not be represented in the same group.

I identified this limitation and questioned whether grouping should instead be handled by the backend. I then explicitly requested backend-side grouping with pagination and error handling.

The corrected implementation introduced a NestJS event-history service that determines event groups before applying pagination and exposes separately paginated delivery history. Angular now renders the server-provided results.

Existing grouping scenarios were moved into backend tests, and frontend fixtures were updated accordingly.

One verification gap remains: the new PostgreSQL grouping/window queries were inspected using offline TypeORM SQL generation but have not yet been executed against a verified isolated PostgreSQL database. Passing mocked tests does not remove this gap.

## Reliability and verification evidence

One challenging integration scenario involved GitHub labeling succeeding while the Slack notification failed.

Durable action status, exponential backoff, and skipping completed actions allow the failed Slack action to retry without intentionally repeating the successfully completed GitHub action.

A temporary development simulation was used to test a Slack HTTP `503` response followed by a successful `200` response. The temporary runtime test routes and UI were removed afterward.

Slack Incoming Webhooks cannot provide a strict exactly-once delivery guarantee when failures involve ambiguous network timeouts or process crashes.

Previously recorded verification results include:

- **180 backend tests passed**
- **32 Angular tests passed**
- Four PostgreSQL tests were skipped during the general test run.
- Four PostgreSQL tests passed during an earlier dedicated database run; however, that run does not verify the newer pagination/grouping queries.
- Application builds and lint checks passed during the recorded feature verification.
- Local production HTTP checks also passed.
- Focused feature formatting passed, while separate repository-wide formatting warnings were recorded.

These are historical verification results and were not rerun specifically while preparing this document. See [README.md](README.md#testing) for the relevant commands and testing scope.

## What I would improve

The next priorities would be:

- Execute the new grouping and pagination queries against an explicitly verified isolated PostgreSQL environment.
- Complete live acceptance testing of the deployed version.
- Resolve remaining development/build dependency advisories.
- Improve shared rate limiting.
- Add stronger production monitoring and observability.

An earlier dependency audit recorded **33 development/build findings and zero production advisories**, but this should not be treated as a current audit result.

Possible future enhancements include a free-tier in-app AI triage feature and GitHub App authentication.

No commit, deployment, production database modification, or live environment change is implied by this document.

AI assistance corrected the collaborator check to use the issue/PR author (push sender), rather than the repository name. Owner events remain eligible; outsiders and missing authors produce skipped Slack actions. HTTP failures retain existing retry metadata, and completed/skipped actions remain idempotent.
