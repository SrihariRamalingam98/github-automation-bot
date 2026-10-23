# AI_NOTES.md — AI-Assisted Development

## 1. Project Overview

**Project:** Event-Driven GitHub Automation Bot  
**Technology Stack:** Angular, NestJS, TypeScript, PostgreSQL, TypeORM, GitHub OAuth, GitHub Webhooks, Slack Incoming Webhooks

This application automates GitHub repository activities using configurable rules. It allows users to sign in with GitHub, connect repositories, process webhook events, perform GitHub actions, send Slack notifications, and monitor activity through a dashboard.

## 2. AI Tools Used

I used **ChatGPT and OpenAI Codex** to support the development of this project.

**ChatGPT helped me with:**

- Understanding and breaking down the assignment requirements.
- Planning the architecture and implementation flow.
- Understanding GitHub OAuth, webhooks and Slack integration.
- Troubleshooting development and configuration issues.
- Planning test scenarios and reviewing technical risks.

**Codex helped me with:**

- Generating and refining Angular and NestJS code.
- Organizing controllers, services, modules, DTOs and database entities.
- Implementing event processing and automation rules.
- Writing unit and integration tests.
- Reviewing security, retry handling and error management.
- Improving code quality, documentation and deployment configuration.

## 3. Development Approach

I followed an iterative development process.

First, I understood the core requirements and divided the work into authentication, repository management, webhook processing, automation rules, Slack notifications and dashboard monitoring.

I used AI to help implement features and troubleshoot issues, then validated the application through local testing and automated test results.

The main functionality includes:

- GitHub OAuth authentication.
- Repository connection and webhook registration.
- GitHub issue, pull request and push event processing.
- Rule-based GitHub actions.
- Slack notifications.
- PostgreSQL event and action tracking.
- Automatic retry handling.
- Dashboard monitoring and event history.

## 4. Most Challenging Problem

### Reliable Webhook Processing and Automatic Retry

One of the most challenging parts was handling webhook events when an external service temporarily fails.

For example, when a GitHub issue is opened, the application may successfully add a label, but Slack notification delivery can fail.

If the entire event is repeated without checking completed actions, the application may perform unnecessary duplicate operations.

### How I Addressed It

I implemented a PostgreSQL-backed event-processing approach with:

- Unique webhook delivery identification.
- Event and action status tracking.
- Retry attempt counts.
- Exponential backoff.
- Background worker processing.
- Database locking.
- Skipping already completed actions.

### How I Tested It

I tested the retry mechanism using simulated Slack responses:

1. The first Slack request returned a simulated HTTP 503 failure.
2. The event was marked for retry.
3. The worker automatically retried the failed action.
4. The second attempt returned a simulated HTTP 200 response.
5. The event was marked as completed.

The dashboard recorded **two attempts and one retry**, with the final event status as `done`.

The test did not send actual Slack notifications or GitHub requests. The temporary simulation functionality was removed after testing.

This helped me understand retry scheduling, idempotency and reliable event processing.

## 5. Other Challenges

### GitHub OAuth Configuration

Initially, the GitHub OAuth callback configuration did not match the application's registered redirect URL.

I corrected the OAuth callback settings and successfully tested GitHub login.

### GitHub Webhook Registration

During development, GitHub returned HTTP 422 while registering a repository webhook.

I configured a publicly accessible HTTPS endpoint and verified webhook delivery.

### Duplicate Webhook Handling

I tested GitHub webhook redelivery and confirmed that it returned HTTP 202 without creating another dashboard event or Slack notification.

### Database Concurrency

I verified PostgreSQL integration behavior covering worker locking, webhook deduplication, retry recovery and completed-action idempotency.

## 6. Testing and Verification

| Test                         | Result                      |
| ---------------------------- | --------------------------- |
| Backend automated tests      | 170 passed                  |
| Angular automated tests      | 30 passed                   |
| PostgreSQL integration tests | 4 passed in a dedicated run |
| Node.js 22 build             | Passed                      |
| ESLint and formatting        | Passed                      |
| GitHub OAuth login           | Tested locally              |
| GitHub issue webhook         | Tested locally              |
| GitHub pull request webhook  | Tested locally              |
| GitHub push webhook          | Tested locally              |
| Automatic GitHub labeling    | Tested locally              |
| Slack notification           | Tested locally              |
| Duplicate webhook prevention | Tested locally              |
| Simulated retry recovery     | Passed                      |

The four PostgreSQL tests passed in an earlier dedicated run and were not repeated in the latest general test execution.

## 7. Security

Security considerations included:

- GitHub OAuth state verification.
- Secure session handling.
- CSRF protection.
- Webhook signature verification.
- Repository ownership validation.
- Input validation.
- Encrypted GitHub token storage.
- Sensitive information redaction.
- Rate limiting.
- PostgreSQL TLS configuration.

## 8. Known Limitations

- Slack Incoming Webhooks cannot guarantee exactly-once delivery in every failure scenario.
- Rate limiting uses application-local state and may need a shared store when scaling to multiple instances.
- The full development dependency audit reported 33 findings, while the production dependency audit reported zero advisories.
- Live production verification is pending for the latest application version.

## 9. What I Learned

This project helped me gain a better understanding of event-driven architecture, GitHub webhooks, OAuth authentication, database-backed background processing, retry mechanisms and external API integrations.

AI accelerated implementation and troubleshooting, but I relied on tests, application logs and integration checks to evaluate the results.

I also learned the importance of understanding AI-generated code, reviewing edge cases and documenting remaining limitations rather than assuming generated solutions are always correct.

### Shared frontend loading feedback

AI assistance added a shared loading service and HTTP interceptor, a top progress bar and a page interaction lock for API requests, navigation and OAuth sign-in. Event and Overview GET requests, including query parameters, bypass both the global progress bar and interaction lock. The UI prevents repeated login/logout clicks and releases request locks on success, errors or cancellation. Browser page restoration clears the OAuth redirect indicator; the long-lived event stream is excluded. Focused tests cover concurrent requests, cancellation, logout/CSRF behavior, navigation and the rendered loading state. No environment variables or backend/database behavior changed.
